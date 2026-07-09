import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useRouterStore, routerInitialState } from '@/store/routerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { usePatternStore, patternInitialState, type PatternRecord } from '@/store/patternStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { useMixinStore, mixinInitialState, type MixinRecord } from '@/store/mixinStore'
import { useLibraryStore, libraryInitialState, type LibraryRecord } from '@/store/libraryStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useDocsStore, docsInitialState } from '@/store/docsStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import {
  controllerProfileInitialState,
  useControllerProfileStore,
  type ControllerProfile,
} from '@/store/controllerProfileStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  initializePersonalContentProvider,
  resetPersonalContentProvider,
} from '@/engine/personalContentProvider'

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
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
  useEditorStore.setState(editorInitialState)
  useDocsStore.setState(docsInitialState)
  useControllerStore.setState(controllerInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowStore.setState(showInitialState)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetPersonalContentProvider()
})

function stubRemotePatterns(patterns: PatternRecord[] = []) {
  const created: PatternRecord[] = []
  const libraries: LibraryRecord[] = []
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
    if (path === '/api/mixins' && init?.method === undefined) {
      return Response.json({ mixins: [] })
    }
    if (path === '/api/libraries' && init?.method === undefined) {
      return Response.json({ libraries })
    }
    if (path === '/api/libraries' && init?.method === 'POST') {
      const record = JSON.parse(String(init.body)) as LibraryRecord
      libraries.push(record)
      return Response.json({ library: record }, { status: 201 })
    }
    if (path.startsWith('/api/libraries/')) {
      return Response.json({ ok: true })
    }
    if (path === '/api/controllers' && init?.method === undefined) {
      return Response.json({ controllers: [] })
    }
    if (path === '/api/shows' && init?.method === undefined) {
      return Response.json({ shows: [] })
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
  void initializePersonalContentProvider({ mode: 'remote-api' })
  return created
}

function seedSignedInWorkspace() {
  useWorkspaceStore.setState({
    personalWorkspaceAuthenticated: true,
    personalWorkspaceResolved: true,
  })
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
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('left-pane')).toBeInTheDocument()
  })

  it('has an editor pane', () => {
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
  })

  it('has a preview pane', () => {
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toBeInTheDocument()
  })

  it('starts with a wider preview pane', () => {
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
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
  const controllerProfile: ControllerProfile = {
    id: 'ctrl-1',
    name: 'Burner bag',
    deviceId: 'pixelblaze_pb32_3cd4ee549434',
    lastKnownDeviceName: 'Pixelblaze shelf',
    lastSeenIp: '192.168.8.224',
    lastKnownPixelCount: 256,
    lastKnownMapDim: 2,
    board: { kind: 'pixelblaze-v3-standard' },
    inputs: [],
    globalTransforms: [],
    patternBindings: [],
    zones: [],
    updatedAt: 1,
  }
  const mapRecord: MapRecord = {
    id: 'map-1',
    name: 'Deep Linked Map',
    dim: 2,
    generator: 'custom',
    params: {},
    source: 'export function map(index, count) { return [0, 0] }',
    points: [[0, 0]],
    updatedAt: 1,
  }
  const mixinRecord: MixinRecord = {
    id: 'mx-1',
    name: 'Deep Linked Mixin',
    kind: 'bind',
    src: '// @param PIN input\n// @target CONTROL\n// @wraps beforeRender\nexport var x = 0',
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
    expect(screen.getByTestId('route-message')).toHaveTextContent('Checking Studio access')
    expect(screen.queryByTestId('editor-pane')).not.toBeInTheDocument()
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

  it('copies active pattern artifacts bundled with user cloud libraries', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const cloudPattern: PatternRecord = {
      ...record,
      src: 'export function render(index) { MyLib.paint(index) }',
    }
    window.history.replaceState(null, '', '/studio/patterns/p-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    usePatternStore.setState({ userPatterns: [cloudPattern], patternsLoaded: true })
    useLibraryStore.setState({
      userLibraries: [{
        id: 'lib-1',
        name: 'MyLib',
        src: 'function paint(index) { hsv(index / pixelCount, 1, 1) }',
        updatedAt: 1,
      }],
      librariesLoaded: true,
    })
    render(<App />)

    await screen.findAllByText('Deep Linked')
    await user.click(screen.getByRole('button', { name: 'Copy Code' }))

    expect(writeText).toHaveBeenCalledOnce()
    const copied = writeText.mock.calls[0][0] as string
    expect(copied).toContain('function _MyLib_paint(')
    expect(copied).toContain('_MyLib_paint(index)')
    expect(copied).not.toContain('MyLib.paint')
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

  it('opens a stock map addressed by /studio/maps/<id>', async () => {
    window.history.replaceState(null, '', '/studio/maps/cube-shell')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMapStore.setState({ mapsLoaded: true })
    render(<App />)

    await waitFor(() => {
      expect(useMapStore.getState().editingMap).toEqual({ kind: 'stock', id: 'cube-shell' })
    })
    expect(useEditorStore.getState().editorFlavor).toBe('map')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Cube shell')
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('read-only')
  })

  it('opens a personal map addressed by /studio/maps/<id>', async () => {
    window.history.replaceState(null, '', '/studio/maps/map-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMapStore.setState({ userMaps: [mapRecord], mapsLoaded: true })
    render(<App />)

    await waitFor(() => {
      expect(useMapStore.getState().editingMap).toEqual({ kind: 'existing', id: 'map-1' })
    })
    expect(useEditorStore.getState().editorFlavor).toBe('map')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Deep Linked Map')
  })

  it('returns to the map list after deleting the routed personal map', async () => {
    const user = userEvent.setup()
    stubRemotePatterns()
    window.history.replaceState(null, '', '/studio/maps/map-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMapStore.setState({ userMaps: [mapRecord], mapsLoaded: true })
    render(<App />)

    await screen.findAllByText('Deep Linked Map')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(window.location.pathname).toBe('/studio/maps'))
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('No map selected')
    expect(screen.queryByTestId('route-message')).not.toBeInTheDocument()
  })

  it('shows a graceful message for a deep link to a missing map', () => {
    window.history.replaceState(null, '', '/studio/maps/nope')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMapStore.setState({ userMaps: [mapRecord], mapsLoaded: true })
    render(<App />)
    expect(screen.getByTestId('route-message')).toHaveTextContent('Map not found')
  })

  it('opens a stock mixin addressed by /studio/mixins/<id>', async () => {
    window.history.replaceState(null, '', '/studio/mixins/pot-binding')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMixinStore.setState({ mixinsLoaded: true })
    render(<App />)

    await waitFor(() => {
      expect(useMixinStore.getState().editingMixin).toEqual({ kind: 'stock', id: 'pot-binding' })
    })
    expect(useEditorStore.getState().editorFlavor).toBe('mixin')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('pot-binding')
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('No Controller or Show bindings use this mixin yet')
  })

  it('opens a personal mixin addressed by /studio/mixins/<id>', async () => {
    window.history.replaceState(null, '', '/studio/mixins/mx-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMixinStore.setState({ userMixins: [mixinRecord], mixinsLoaded: true })
    render(<App />)

    await waitFor(() => {
      expect(useMixinStore.getState().editingMixin).toEqual({ kind: 'existing', id: 'mx-1' })
    })
    expect(useEditorStore.getState().editorFlavor).toBe('mixin')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Deep Linked Mixin')
  })

  it('opens a stock library addressed by /studio/libraries/<id>', async () => {
    window.history.replaceState(null, '', '/studio/libraries/Shader')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    await waitFor(() => {
      expect(usePatternStore.getState().activeLibraryName).toBe('Shader')
    })
    expect(useEditorStore.getState().editorFlavor).toBe('library')
    expect(useEditorStore.getState().source).toContain('function fract')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Shader')
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('library')
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('API Reference')
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('Shader.fract(x)')
  })

  it('opens a personal library addressed by /studio/libraries/<id>', async () => {
    const library: LibraryRecord = {
      id: 'lib-1',
      name: 'MyLib',
      src: 'function scale(v) { return v }',
      updatedAt: 1,
    }
    window.history.replaceState(null, '', '/studio/libraries/lib-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useLibraryStore.setState({ userLibraries: [library], librariesLoaded: true })
    render(<App />)

    await waitFor(() => {
      expect(useLibraryStore.getState().editingLibrary).toEqual({ kind: 'existing', id: 'lib-1' })
    })
    expect(usePatternStore.getState().activeLibraryName).toBe('MyLib')
    expect(useEditorStore.getState().editorFlavor).toBe('library')
    expect(useEditorStore.getState().source).toContain('function scale')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('MyLib')
    expect(screen.getByTestId('editor-pane')).not.toHaveTextContent('read-only')
  })

  it('clones a stock library from library mode into an editable cloud library', async () => {
    const user = userEvent.setup()
    stubRemotePatterns()
    window.history.replaceState(null, '', '/studio/libraries/Shader')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    await waitFor(() => {
      expect(useLibraryStore.getState().editingLibrary).toEqual({ kind: 'stock', id: 'Shader' })
    })
    await user.click(await screen.findByRole('button', { name: 'Clone' }))

    await waitFor(() => {
      expect(useLibraryStore.getState().userLibraries[0]?.name).toBe('Shader2')
    })
    const clone = useLibraryStore.getState().userLibraries[0]
    expect(window.location.pathname).toBe(`/studio/libraries/${clone.id}`)
    expect(useLibraryStore.getState().editingLibrary).toEqual({ kind: 'existing', id: clone.id })
    expect(useEditorStore.getState().isReadOnly).toBe(false)
  })

  it('returns to the mixin list after deleting the routed personal mixin', async () => {
    const user = userEvent.setup()
    stubRemotePatterns()
    window.history.replaceState(null, '', '/studio/mixins/mx-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMixinStore.setState({ userMixins: [mixinRecord], mixinsLoaded: true })
    render(<App />)

    await screen.findAllByText('Deep Linked Mixin')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(window.location.pathname).toBe('/studio/mixins'))
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('No mixin selected')
    expect(screen.queryByTestId('route-message')).not.toBeInTheDocument()
  })

  it('returns to the pattern list after deleting the routed personal pattern', async () => {
    const user = userEvent.setup()
    stubRemotePatterns()
    window.history.replaceState(null, '', '/studio/patterns/p-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    usePatternStore.setState({ userPatterns: [record], patternsLoaded: true })
    render(<App />)

    await screen.findAllByText('Deep Linked')
    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns'))
    expect(screen.queryByTestId('route-message')).not.toBeInTheDocument()
  })

  it('shows a graceful message for a deep link to a missing mixin', () => {
    window.history.replaceState(null, '', '/studio/mixins/nope')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useMixinStore.setState({ userMixins: [mixinRecord], mixinsLoaded: true })
    render(<App />)
    expect(screen.getByTestId('route-message')).toHaveTextContent('Mixin not found')
  })

  it('opens a controller profile addressed by /studio/controllers/<id>', () => {
    window.history.replaceState(null, '', '/studio/controllers/ctrl-1')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    useControllerProfileStore.setState({
      profiles: [controllerProfile],
      profilesLoaded: true,
    })
    render(<App />)

    expect(screen.getByTestId('controller-profile-page')).toHaveTextContent('Pixelblaze shelf')
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Pixelblaze shelf')
    expect(screen.getByTestId('editor-pane')).not.toHaveTextContent('Burner bag')
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

  it('opens a Gallery pattern detail page read-only in Studio', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    stubRemotePatterns()
    render(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
    await userEvent.click(screen.getByRole('button', { name: 'Open in Studio' }))
    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns/IridescentFibers'))
    expect(usePatternStore.getState().activePatternId).toBeNull()
    expect(usePatternStore.getState().activeDemoName).toBe('IridescentFibers')
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
    expect(within(screen.getByTestId('editor-pane')).getByRole('button', { name: 'View in Gallery' })).toBeInTheDocument()
    expect(within(screen.getByTestId('editor-pane')).getByRole('button', { name: 'Clone' })).toBeInTheDocument()
  })

  it('opens a Gallery pattern in Studio signed out without queuing a clone', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Open in Studio' }))

    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns/IridescentFibers'))
    expect(usePatternStore.getState().activeDemoName).toBe('IridescentFibers')
    expect(screen.queryByTestId('studio-welcome-page')).not.toBeInTheDocument()
    expect(screen.getByTestId('left-pane')).toBeInTheDocument()
  })

  it('shows pattern source in a read-only detail-stage code view', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Code/i }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-code-stage')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Studio' })).toBeInTheDocument()
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
