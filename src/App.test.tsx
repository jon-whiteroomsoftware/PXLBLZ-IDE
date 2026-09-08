import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import {
  referenceNavigationInitialState,
  useReferenceNavigationStore,
} from '@/store/referenceNavigationStore'
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
import { createDefaultShow } from '@/engine/showModel'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { entityOrganizationInitialState, useEntityOrganizationStore } from '@/store/entityOrganizationStore'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { openDemoPattern } from '@/store/openPattern'
import { studioOperationInitialState, useStudioOperationStore } from '@/store/studioOperationStore'
import { EMPTY_REMEMBERED_STUDIO_PLACES, useStudioPlaceStore } from '@/store/studioPlaceStore'
import { useStudioEntityDrawerStore } from '@/store/studioEntityDrawerStore'

const authSessionMock = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
}))

const analyticsMock = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/analytics')>()),
  trackEvent: analyticsMock.trackEvent,
}))

// Hold the startup auth probe pending by default so the smoke tests exercise
// the studio shell without the signed-out Gallery redirect kicking in
// mid-test; focused auth tests replace this implementation.
vi.mock('@/engine/authSession', () => ({
  getAuthSession: authSessionMock.getAuthSession,
}))

beforeEach(() => {
  analyticsMock.trackEvent.mockReset()
  authSessionMock.getAuthSession.mockReset()
  authSessionMock.getAuthSession.mockImplementation(() => new Promise(() => {}))
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
  useReferenceNavigationStore.setState(referenceNavigationInitialState)
  useControllerStore.setState(controllerInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowStore.setState(showInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
  useEntityOrganizationStore.setState(entityOrganizationInitialState)
  useStudioOperationStore.setState(studioOperationInitialState)
  useStudioPlaceStore.setState({ remembered: EMPTY_REMEMBERED_STUDIO_PLACES })
  useStudioEntityDrawerStore.setState({ pinPreferences: {} })
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

function setStudioLocation(path = '/studio') {
  window.history.replaceState(null, '', path)
}

async function choosePlace(name: 'Patterns' | 'Shows' | 'Maps' | 'Controllers' | 'Mixins' | 'Libraries' | 'Docs' | 'API') {
  const trigger = screen.getByTestId('top-bar').querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')
  if (!trigger) throw new Error('Place control trigger not found')
  await userEvent.click(trigger)
  await userEvent.click(within(screen.getByRole('listbox', { name: 'Places' })).getByRole('option', {
    name: new RegExp(`^${name}`),
  }))
}

describe('App smoke test', () => {
  it('renders without crashing', () => {
    render(<App />)
  })

  it('has a top bar', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it.each([
    ['/studio/patterns', 'Patterns'],
    ['/studio/shows', 'Shows'],
    ['/studio/maps', 'Maps'],
    ['/studio/controllers', 'Controllers'],
    ['/studio/mixins', 'Mixins'],
    ['/studio/libraries', 'Libraries'],
    ['/docs', 'Docs'],
    ['/reference', 'API'],
  ] as const)('labels the top-bar place control from %s (#965)', (path, label) => {
    setStudioLocation(path)
    seedSignedInWorkspace()
    render(<App />)
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: label })).toHaveAttribute(
      'aria-haspopup',
      'listbox',
    )
  })

  it('navigates all places with documented mnemonic shortcuts without claiming local controls (#965)', () => {
    setStudioLocation('/studio/patterns')
    seedSignedInWorkspace()
    render(<App />)

    for (const [key, path] of [
      ['s', '/studio/shows'],
      ['m', '/studio/maps'],
      ['c', '/studio/controllers'],
      ['x', '/studio/mixins'],
      ['l', '/studio/libraries'],
      ['d', '/docs'],
      ['r', '/reference'],
      ['p', '/studio/patterns'],
    ] as const) {
      fireEvent.keyDown(document.body, { key })
      expect(window.location.pathname).toBe(path)
    }

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 's' })
    expect(window.location.pathname).toBe('/studio/patterns')
    input.focus()
    fireEvent.keyDown(document.body, { key: 'x' })
    expect(window.location.pathname).toBe('/studio/patterns')
    input.remove()
  })

  it('does not arm Studio place shortcuts on public browse routes (#965)', () => {
    setStudioLocation('/gallery')
    seedSignedInWorkspace()
    render(<App />)

    fireEvent.keyDown(document.body, { key: 's' })

    expect(window.location.pathname).toBe('/gallery')
  })

  it('keeps signed-out reference readers on the page for Studio place shortcuts (#965)', () => {
    setStudioLocation('/docs')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)

    fireEvent.keyDown(document.body, { key: 's' })

    expect(window.location.pathname).toBe('/docs')
  })

  it('shows and restores the active Pattern and Show remembered across reference routes (#965)', async () => {
    const pattern: PatternRecord = {
      id: 'remembered-pattern',
      name: 'Evening Pattern',
      src: 'export function render(index) {}',
      controls: {},
      updatedAt: 1,
    }
    const starter: PatternRecord = {
      ...pattern,
      id: 'pxlblz-starter-pattern-v1',
      name: 'Starter Pattern',
    }
    const show = createDefaultShow('remembered-show', 'Evening Show', 1)
    const hydratedShow = createDefaultShow('hydrated-show', 'Hydrated Show', 2)
    setStudioLocation(`/studio/patterns/${pattern.id}`)
    seedSignedInWorkspace()
    usePatternStore.setState({ userPatterns: [pattern, starter], patternsLoaded: true, activePatternId: pattern.id })
    useShowStore.setState({ shows: [show, hydratedShow], showsLoaded: true, activeShowId: show.id })
    render(<App />)

    await waitFor(() => expect(useStudioPlaceStore.getState().remembered.patterns).toBe(pattern.id))
    expect(useStudioPlaceStore.getState().remembered.shows).toBeNull()

    await choosePlace('Shows')
    await waitFor(() => expect(window.location.pathname).toBe(`/studio/shows/${show.id}`))
    await waitFor(() => expect(useStudioPlaceStore.getState().remembered.shows).toBe(show.id))
    await choosePlace('Docs')
    act(() => usePatternStore.setState({ activeDemoName: null, activePatternId: starter.id }))
    act(() => useShowStore.setState({ activeShowId: hydratedShow.id }))
    expect(useStudioPlaceStore.getState().remembered.patterns).toBe(pattern.id)
    expect(useStudioPlaceStore.getState().remembered.shows).toBe(show.id)
    const trigger = within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Docs' })
    await userEvent.click(trigger)
    const places = screen.getByRole('listbox', { name: 'Places' })
    expect(within(places).getByRole('option', { name: /^Patterns/ })).toHaveTextContent(pattern.name)
    expect(within(places).getByRole('option', { name: /^Shows/ })).toHaveTextContent(show.name)

    await userEvent.click(within(places).getByRole('option', { name: /^Shows/ }))
    expect(window.location.pathname).toBe(`/studio/shows/${show.id}`)
    await choosePlace('Docs')
    await choosePlace('Patterns')
    expect(window.location.pathname).toBe(`/studio/patterns/${pattern.id}`)
  })

  it.each([null, 'IridescentFibers'] as const)(
    'keeps the routed demo remembered across personal Pattern hydration from demo state %s (#965)',
    async (activeDemoName) => {
    setStudioLocation('/studio/patterns/IridescentFibers')
    seedSignedInWorkspace()
    usePatternStore.setState({
      activeDemoName,
      activePatternId: 'pxlblz-starter-pattern-v1',
      userPatterns: [{
        id: 'pxlblz-starter-pattern-v1',
        name: 'Starter Pattern',
        src: 'export function render(index) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns/IridescentFibers'))
    await waitFor(() => expect(useStudioPlaceStore.getState().remembered.patterns).toBe('IridescentFibers'))

    act(() => usePatternStore.getState().setActivePattern('pxlblz-starter-pattern-v1'))
    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns/pxlblz-starter-pattern-v1'))
    },
  )

  it('keeps an explicit personal Pattern route while its record is still loading (#965)', async () => {
    const starter: PatternRecord = {
      id: 'pxlblz-starter-pattern-v1',
      name: 'Starter Pattern',
      src: 'export function render(index) {}',
      controls: {},
      updatedAt: 1,
    }
    const requested: PatternRecord = {
      ...starter,
      id: 'requested-pattern',
      name: 'Requested Pattern',
    }
    setStudioLocation(`/studio/patterns/${requested.id}`)
    seedSignedInWorkspace()
    usePatternStore.setState({
      activePatternId: starter.id,
      userPatterns: [starter],
      patternsLoaded: false,
    })
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe(`/studio/patterns/${requested.id}`))

    act(() => usePatternStore.setState({ userPatterns: [starter, requested], patternsLoaded: true }))
    await waitFor(() => expect(usePatternStore.getState().activePatternId).toBe(requested.id))
    expect(window.location.pathname).toBe(`/studio/patterns/${requested.id}`)

    act(() => usePatternStore.getState().setActivePattern(starter.id))
    await waitFor(() => expect(window.location.pathname).toBe(`/studio/patterns/${starter.id}`))
  })

  it('links the PXLBLZ wordmark to the app root', () => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'PXLBLZ home' })).toHaveAttribute('href', import.meta.env.BASE_URL)
  })

  it('has a left pane', () => {
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('left-pane')).toBeInTheDocument()
  })

  it('tucks the entity list behind its place edge tab and reopens it as an overlay (#466, #965, #966)', async () => {
    setStudioLocation()
    seedSignedInWorkspace()
    render(<App />)

    const layout = screen.getByTestId('studio-drawer-layout')
    expect(layout).toHaveAttribute('data-drawer-mode', 'pinned')
    expect(screen.queryByRole('button', { name: 'Catalog' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Unpin Patterns list' }))
    expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
    expect(screen.queryByRole('radiogroup', { name: 'Studio activity' })).not.toBeInTheDocument()
    const edgeTab = screen.getByRole('button', { name: 'Open the Patterns list' })
    expect(edgeTab).toHaveClass('w-[22px]')

    await userEvent.click(edgeTab)
    expect(layout).toHaveAttribute('data-drawer-mode', 'open')
    expect(screen.getByRole('button', { name: 'Pin Patterns list' })).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('editor-pane'))
    expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
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
    vi.stubGlobal('innerWidth', 1440)
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '460px' })
  })

  it('shrinks an untouched preview to keep the authoring pane at least equally wide as browser zoom reduces the workspace (#63)', () => {
    vi.stubGlobal('innerWidth', 1440)
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '460px' })

    vi.stubGlobal('innerWidth', 1000)
    fireEvent(window, new Event('resize'))

    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '351px' })
  })

  it('remembers right-pane width per Studio mode instead of leaking it across modes (#63)', async () => {
    vi.stubGlobal('innerWidth', 1440)
    setStudioLocation()
    seedSignedInWorkspace()
    const { container } = render(<App />)

    const splitters = container.querySelectorAll('.cursor-col-resize')
    const rightSplitter = splitters[splitters.length - 1]
    fireEvent.mouseDown(rightSplitter, { clientX: 800 })
    fireEvent(window, new MouseEvent('mousemove', { clientX: 600 }))
    fireEvent(window, new MouseEvent('mouseup'))
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '660px' })

    await choosePlace('Shows')
    expect(screen.queryByTestId('preview-pane')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('show-workspace')).queryByRole('separator', { name: 'Resize timeline and Stage' })).not.toBeInTheDocument()

    await choosePlace('Patterns')
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '660px' })
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

  it('renames a user Pattern from the middle-pane title', async () => {
    const user = userEvent.setup()
    const renamePattern = vi.fn()
    window.history.replaceState(null, '', '/studio/patterns/p-1')
    seedSignedInWorkspace()
    usePatternStore.setState({ userPatterns: [record], patternsLoaded: true, renamePattern })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    await user.click(await within(editorPane).findByRole('button', { name: 'Rename pattern Deep Linked' }))
    await user.clear(within(editorPane).getByRole('textbox', { name: 'Pattern name' }))
    await user.type(within(editorPane).getByRole('textbox', { name: 'Pattern name' }), 'Night Pattern{Enter}')
    expect(renamePattern).toHaveBeenCalledWith(record.id, 'Night Pattern')
  })

  it('renames a Show from the middle-pane title', async () => {
    const user = userEvent.setup()
    const renameShow = vi.fn()
    const show = createDefaultShow('show-header', 'Aurora Show', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    setStudioLocation('/studio/shows/show-header')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id, renameShow })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    await user.click(within(editorPane).getByRole('button', { name: 'Rename show Aurora Show' }))
    await user.clear(within(editorPane).getByRole('textbox', { name: 'Show name' }))
    await user.type(within(editorPane).getByRole('textbox', { name: 'Show name' }), 'Night Show')
    await user.click(within(editorPane).getByRole('button', { name: 'Apply show name' }))
    expect(renameShow).toHaveBeenCalledWith(show.id, 'Night Show')
  })

  it('renames a matching live Controller from the middle-pane title', async () => {
    const user = userEvent.setup()
    const renameControllerProfile = vi.fn(async () => {})
    window.history.replaceState(null, '', '/studio/controllers/ctrl-1')
    seedSignedInWorkspace()
    useControllerProfileStore.setState({ profiles: [controllerProfile], profilesLoaded: true })
    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: controllerProfile.deviceId,
          nickname: controllerProfile.name,
          phase: 'live',
          liveEpoch: 1,
          installedMap: { status: 'absent', observedAt: 1 },
          mapDim: null,
        },
      },
      renameControllerProfile,
    })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    await user.click(within(editorPane).getByRole('button', { name: 'Rename controller Burner bag' }))
    await user.clear(within(editorPane).getByRole('textbox', { name: 'Controller name' }))
    await user.type(within(editorPane).getByRole('textbox', { name: 'Controller name' }), 'Road case{Enter}')
    expect(renameControllerProfile).toHaveBeenCalledWith('ctrl-1', 'Road case')
  })

  it('does not offer a local-only rename for an offline Controller profile', () => {
    window.history.replaceState(null, '', '/studio/controllers/ctrl-1')
    seedSignedInWorkspace()
    useControllerProfileStore.setState({ profiles: [controllerProfile], profilesLoaded: true })

    render(<App />)

    expect(screen.queryByRole('button', { name: 'Rename controller Burner bag' })).not.toBeInTheDocument()
  })

  it('puts Show details and quiet Show metadata in the title row', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-header', 'Simplest possible show', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    setStudioLocation('/studio/shows/show-header')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    expect(within(editorPane).getAllByText('Simplest possible show').length).toBeGreaterThan(0)
    expect(within(editorPane).getByTitle('Show output summary')).toHaveTextContent('Portable')
    expect(within(editorPane).getByTitle('Show output summary')).not.toHaveTextContent(/scene/i)
    expect(within(editorPane).getByRole('button', { name: 'Show properties' }).querySelector('.show-header-action-label')).toHaveTextContent('Properties')
    expect(within(editorPane).queryByRole('menuitem', { name: 'View code' })).not.toBeInTheDocument()
    await user.click(within(editorPane).getByRole('button', { name: 'Show actions' }))
    expect(screen.getByRole('menuitem', { name: 'View code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download .epe' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Clone' })).not.toBeInTheDocument()
    expect(within(editorPane).queryByText('View generated pattern')).not.toBeInTheDocument()

    await user.click(within(editorPane).getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    expect(screen.getByRole('heading', { name: 'TestPattern1D' })).toBeInTheDocument()
    await user.click(within(editorPane).getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
  })

  it('moves the Show Stage into an explicit narrow-workspace preview dialog (#588)', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('innerWidth', 900)
    const show = createDefaultShow('show-narrow-stage', 'Narrow Stage', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    setStudioLocation('/studio/shows/show-narrow-stage')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    expect(screen.queryByRole('dialog', { name: 'Show Stage preview' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage')).not.toBeInTheDocument()
    const previewStage = screen.getByRole('button', { name: 'Preview Stage' })
    await user.click(previewStage)

    const dialog = screen.getByRole('dialog', { name: 'Show Stage preview' })
    expect(within(dialog).getByLabelText('Show stage')).toBeInTheDocument()
    expect(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage')).not.toBeInTheDocument()

    vi.stubGlobal('innerWidth', 1200)
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('dialog', { name: 'Show Stage preview' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('show-stage-strip')).getByLabelText('Show stage')).toBeInTheDocument()

    vi.stubGlobal('innerWidth', 900)
    fireEvent(window, new Event('resize'))
    await user.click(screen.getByRole('button', { name: 'Preview Stage' }))
    const reopenedDialog = screen.getByRole('dialog', { name: 'Show Stage preview' })
    const close = within(reopenedDialog).getByRole('button', { name: 'Close Stage preview' })
    expect(close).toHaveFocus()
    await user.click(close)
    expect(screen.queryByRole('dialog', { name: 'Show Stage preview' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Stage' })).toHaveFocus())
  })

  it('advances narrow Show playback while the Stage preview is closed (#593)', async () => {
    const user = userEvent.setup()
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id) })
    vi.stubGlobal('innerWidth', 900)
    const show = createDefaultShow('show-narrow-playback', 'Narrow playback', 1000)
    setStudioLocation('/studio/shows/show-narrow-playback')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    expect(screen.queryByRole('dialog', { name: 'Show Stage preview' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage')).not.toBeInTheDocument()
    act(() => usePreviewStore.getState().setRunning(true))
    await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))

    const runFrame = (timestamp: number) => {
      const entries = [...callbacks.entries()]
      const entry = entries[entries.length - 1]
      expect(entry).toBeDefined()
      callbacks.delete(entry![0])
      act(() => entry![1](timestamp))
    }
    runFrame(0)
    runFrame(20)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState().positionMs).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Preview Stage' }))
    const dialog = screen.getByRole('dialog', { name: 'Show Stage preview' })
    // Mounting the Stage preview mid-Show reconstructs its replay runtime
    // asynchronously, yielding between chunks via setTimeout(0); drain those
    // turns inside act instead of letting the finish land in a later gap (#917).
    await act(async () => {
      for (let turn = 0; turn < 20; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })
    act(() => usePreviewStore.getState().setRunning(true))
    const positionBeforeClose = useShowTransportStore.getState().positionMs
    callbacks.clear()
    await user.click(within(dialog).getByRole('button', { name: 'Close Stage preview' }))
    await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))
    runFrame(100)
    runFrame(120)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState().positionMs).toBeGreaterThan(positionBeforeClose)

    const positionBeforeCode = useShowTransportStore.getState().positionMs
    await user.click(screen.getByRole('button', { name: 'Show actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'View code' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to show' })).toBeInTheDocument())
    await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))
    runFrame(200)
    runFrame(220)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState().positionMs).toBeGreaterThan(positionBeforeCode)

    await user.click(screen.getByRole('button', { name: 'Back to show' }))
    vi.stubGlobal('innerWidth', 1200)
    fireEvent(window, new Event('resize'))

    expect(within(screen.getByTestId('show-stage-strip')).getByLabelText('Show stage')).toBeInTheDocument()
    expect(usePreviewStore.getState().isRunning).toBe(true)
    // Widening remounts the Stage mid-Show, which reconstructs its replay
    // runtime asynchronously; drain those setTimeout(0) turns inside act so
    // the finish does not land outside act after the test body (#917).
    await act(async () => {
      for (let turn = 0; turn < 20; turn++) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    })
  })

  it.each([
    ['narrow', 900, false],
    ['wide', 1200, true],
  ])('pauses inherited Pattern playback when navigating to a %s Show (#593)', async (_label, width, hasStage) => {
    vi.stubGlobal('innerWidth', width)
    const show = createDefaultShow('show-narrow-inherited-playback', 'Inherited playback', 1000)
    setStudioLocation()
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: null })

    render(<App />)
    act(() => usePreviewStore.setState({ isRunning: true }))
    await choosePlace('Shows')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument())

    expect(Boolean(width > 980
      ? within(screen.getByTestId('show-stage-strip')).queryByLabelText('Show stage')
      : within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage'))).toBe(hasStage)
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(useShowTransportStore.getState().positionMs).toBe(0)
  })

  it.each([
    ['narrow', 900],
    ['wide', 1200],
  ])('pauses playback when switching Shows in the %s workspace (#593)', async (_label, width) => {
    vi.stubGlobal('innerWidth', width)
    const first = createDefaultShow('show-switch-first', 'First transition Show', 1000)
    const second = createDefaultShow('show-switch-second', 'Second transition Show', 1000)
    setStudioLocation(`/studio/shows/${first.id}`)
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [first, second], showsLoaded: true, activeShowId: first.id })

    render(<App />)
    act(() => usePreviewStore.setState({ isRunning: true }))
    act(() => {
      void useShowStore.getState().openShow(second.id)
      useRouterStore.getState().navigate({
        kind: 'studio',
        entity: { kind: 'shows', id: second.id },
      })
    })
    await waitFor(() => expect(useShowStore.getState().activeShowId).toBe(second.id))

    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(useShowTransportStore.getState()).toMatchObject({
      showId: second.id,
      positionMs: 0,
      seekStatus: 'idle',
    })
  })

  it('gives the production Show one workspace owner for its header, timeline, and Stage (#592)', () => {
    vi.stubGlobal('innerWidth', 1440)
    const show = createDefaultShow('show-workspace-owner', 'Workspace owner', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    setStudioLocation('/studio/shows/show-workspace-owner')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    const workspace = screen.getByTestId('show-workspace')
    const editor = screen.getByTestId('editor-pane')
    const stage = screen.getByTestId('show-stage-strip')

    expect(workspace).toContainElement(editor)
    expect(workspace).toContainElement(stage)
    expect(workspace).toHaveClass('contents')
    expect(editor).toHaveClass('flex-1', 'min-w-0', 'flex', 'flex-col', 'overflow-hidden')
    expect(stage).toContainElement(screen.getByTestId('show-stage-preview'))
    expect(screen.getByTestId('show-stage-preview')).toHaveAttribute('data-presentation', 'strip')
    const previewSplitter = within(workspace).getByRole('separator', { name: 'Resize timeline and Stage' })
    expect(previewSplitter).toHaveAttribute('tabindex', '0')
    expect(previewSplitter).toHaveAttribute('aria-orientation', 'horizontal')
    const before = Number(previewSplitter.getAttribute('aria-valuenow'))
    fireEvent.keyDown(previewSplitter, { key: 'ArrowDown' })
    expect(previewSplitter).toHaveAttribute('aria-valuenow', String(before + 10))
    expect(within(workspace).getByText('Workspace owner')).toBeInTheDocument()
    expect(within(workspace).getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(within(workspace).getByLabelText('Show stage')).toBeInTheDocument()
    expect(within(workspace).getByRole('button', { name: 'Preview Stage' })).toHaveClass('max-[980px]:inline-flex')
  })

  it('gives the Show editor sole ownership of the global Space shortcut (#588)', () => {
    const show = createDefaultShow('show-space-owner', 'Space owner', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    setStudioLocation('/studio/shows/show-space-owner')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    const clip = screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0]
    clip.focus()
    expect(usePreviewStore.getState().isRunning).toBe(false)
    fireEvent.keyDown(clip, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    fireEvent.keyDown(clip, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('projects a Showcase Pattern slot choice through the routed stock Show artifact (#506, #714)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-wipe-transitions')!
    setStudioLocation(`/studio/shows/${stock.id}`)
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [], showsLoaded: true, activeShowId: null })
    useShowEditorSessionStore.getState().setShowNoteOpen(stock.id, true)

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    await user.click(within(editorPane).getByRole('button', { name: 'Patterns (2)' }))
    const patternDialog = screen.getByRole('dialog', { name: 'Try with Pattern' })
    // The Murmuration backdrop is doctrine-fixed and offers no swap box
    // since slot declarations began scoping the surface (#822).
    expect(within(patternDialog).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('InfinityFlower2D')
    const selector = within(patternDialog).getByRole('combobox', { name: 'Pattern 2' })
    expect(selector).toHaveValue('MetaballGarden')
    await user.click(selector)
    await user.click(screen.getByRole('option', { name: 'Caustics' }))

    await waitFor(() => {
      expect(within(editorPane).getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)
    })
    expect(within(editorPane).queryByRole('button', { name: 'Select MetaballGarden' })).not.toBeInTheDocument()
  }, 15_000)

  it('toggles the active Studio preview once with Space outside an editing control', () => {
    window.history.replaceState(null, '', '/studio/patterns/TestPattern1D')
    seedSignedInWorkspace()

    render(<App />)

    const placeTrigger = within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Patterns' })
    placeTrigger.focus()
    fireEvent.keyDown(placeTrigger, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()
    fireEvent.keyDown(placeTrigger, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(false)
    input.remove()

    // Built-in Pattern folders start collapsed (#829), so exercise the global
    // shortcut from a visible tree item without depending on a hidden leaf.
    const visibleTreeItem = screen.getAllByRole('treeitem')[0]!
    fireEvent.keyDown(visibleTreeItem, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('keeps focused place-trigger Space on Preview in Shows and inert in Docs (#965)', () => {
    const show = createDefaultShow('space-place-show', 'Space place Show', 1_000)
    setStudioLocation(`/studio/shows/${show.id}`)
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })
    const showApp = render(<App />)

    const showTrigger = within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Shows' })
    expect(fireEvent.keyDown(showTrigger, { code: 'Space', key: ' ' })).toBe(false)
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()

    showApp.unmount()
    usePreviewStore.setState({ isRunning: false })
    setStudioLocation('/docs')
    render(<App />)

    const docsTrigger = within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Docs' })
    expect(fireEvent.keyDown(docsTrigger, { code: 'Space', key: ' ' })).toBe(false)
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.queryByRole('listbox', { name: 'Places' })).not.toBeInTheDocument()
  })

  it('toggles a Show preview only once when shared and Show shortcuts are mounted', () => {
    const show = createDefaultShow('show-space-once', 'One toggle', 1000)
    setStudioLocation(`/studio/shows/${show.id}`)
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('sends signed-out visitors from /studio to the one-time Studio welcome page', () => {
    window.history.replaceState(null, '', '/studio')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    render(<App />)
    expect(window.location.pathname).toBe('/studio-welcome')
    expect(screen.getByTestId('studio-welcome-page')).toHaveTextContent('Sign in to Studio')
    expect(screen.getByTestId('studio-welcome-page')).toHaveTextContent(/same email .* same workspace/i)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/docs/privacy')
  })

  it('does not redirect before the auth probe settles', () => {
    window.history.replaceState(null, '', '/studio')
    render(<App />)
    expect(window.location.pathname).toBe('/studio')
    expect(screen.getByTestId('route-message')).toHaveTextContent('Checking Studio access')
    expect(screen.queryByTestId('editor-pane')).not.toBeInTheDocument()
  })

  it('turns a failed Studio access probe into a recoverable retry state', async () => {
    window.history.replaceState(null, '', '/studio')
    authSessionMock.getAuthSession
      .mockRejectedValueOnce(new Error('Auth session request timed out'))
      .mockResolvedValueOnce({
        authenticated: true,
        user: {
          id: 'user-1',
          primaryProvider: 'github',
          primaryHandle: 'voidstar',
          displayName: 'Void Star',
          avatarUrl: null,
          identities: [],
        },
      })

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Studio access unavailable' })).toBeInTheDocument()
    expect(screen.getByText(/local workspace service did not respond/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByTestId('editor-pane')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account menu for voidstar/i })).toBeInTheDocument()
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

  describe('auth result notices (#701)', () => {
    it('records a successful OAuth callback quietly and strips its result params', () => {
      window.history.replaceState(null, '', '/?auth=success&auth_provider=github')
      render(<App />)

      expect(screen.queryByTestId('auth-result-notice')).not.toBeInTheDocument()
      expect(window.location.search).toBe('')
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith('auth_result', {
        outcome: 'success',
        code: 'success',
        provider: 'github',
      })
    })

    it('surfaces an OAuth provider failure and records its provider without identity data', async () => {
      window.history.replaceState(null, '', '/?auth=error&auth_provider=google')
      render(<App />)

      const notice = screen.getByTestId('auth-result-notice')
      expect(notice).toHaveTextContent(/try again/i)
      expect(window.location.search).toBe('')
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith('auth_result', {
        outcome: 'failure',
        code: 'error',
        provider: 'google',
      })

      await userEvent.click(within(notice).getByRole('button', { name: /dismiss/i }))
      expect(screen.queryByTestId('auth-result-notice')).not.toBeInTheDocument()
    })

    it('preserves unrelated query params when stripping the auth result', () => {
      window.history.replaceState(null, '', '/?auth=error&capture=1')
      render(<App />)

      expect(screen.getByTestId('auth-result-notice')).toHaveTextContent(/try again/i)
      expect(window.location.search).toBe('?capture=1')
    })

    it('shows no notice after a clean load', () => {
      render(<App />)
      expect(screen.queryByTestId('auth-result-notice')).not.toBeInTheDocument()
    })
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

  it('opens the first user Pattern when the Patterns route has no selection', async () => {
    const older = { ...record, id: 'p-older', name: 'Older Pattern', updatedAt: 1 }
    const first = { ...record, id: 'p-first', name: 'First Pattern', updatedAt: 2 }
    window.history.replaceState(null, '', '/studio/patterns')
    seedSignedInWorkspace()
    usePatternStore.setState({
      userPatterns: [first, older],
      patternsLoaded: true,
      activePatternId: null,
      activeDemoName: null,
    })

    render(<App />)

    await waitFor(() => expect(usePatternStore.getState().activePatternId).toBe('p-first'))
    expect(useEditorStore.getState().source).toBe(first.src)
    expect(window.location.pathname).toBe('/studio/patterns/p-first')
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
    await user.click(screen.getByRole('button', { name: 'Pattern actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy code' }))

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

  it('does not show a stale Pattern push failure on a Show route (#849)', async () => {
    const show = createDefaultShow('show-stale-pattern-failure', 'Show route', 1)
    setStudioLocation(`/studio/shows/${show.id}`)
    seedSignedInWorkspace()
    usePatternStore.setState({
      userPatterns: [record],
      patternsLoaded: true,
      activePatternId: record.id,
    })
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })
    useControllerStore.setState({
      artifactPushResult: {
        ok: false,
        message: 'Pattern compile failed',
        artifactId: record.id,
        mode: 'run',
      },
    })

    render(<App />)

    await waitFor(() => expect(useRouterStore.getState().route).toMatchObject({
      kind: 'studio',
      entity: { kind: 'shows', id: show.id },
    }))
    expect(usePatternStore.getState().activePatternId).toBe(record.id)
    await waitFor(() => expect(screen.queryByTestId('pattern-push-failure')).not.toBeInTheDocument())
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
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('Parameters are bound on the Controller that uses this mixin')
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
    await user.click(screen.getByRole('button', { name: 'Pattern actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete pattern' }))
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
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Burner bag')
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Pixelblaze shelf')
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('Saved PXLBLZ Patterns (0)')
    expect(screen.getByTestId('editor-pane')).not.toHaveTextContent('Saved programs')
  })

  it('guides an empty Controllers workspace through Chrome extension setup (#811)', () => {
    window.history.replaceState(null, '', '/studio/controllers')
    seedSignedInWorkspace()
    useControllerProfileStore.setState({ profiles: [], profilesLoaded: true })
    useControllerStore.setState({
      extensionPresent: false,
      detectExtension: async () => false,
    })

    render(<App />)

    const emptyState = screen.getByTestId('controller-profiles-empty-state')
    expect(within(emptyState).getByRole('heading', { name: 'Connect your Controllers.' })).toBeInTheDocument()
    expect(emptyState).toHaveTextContent(
      "PXLBLZ uses a Chrome extension to reach Controllers on your local network. Install it once, approve Chrome's install and Controller access prompts, then connect.",
    )
    expect(within(emptyState).getByRole('link', { name: 'Install Chrome extension' })).toHaveAttribute(
      'href',
      'https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg',
    )
    expect(screen.queryByTestId('preview-pane')).not.toBeInTheDocument()
  })

  it('opens the existing Connect flow from an extension-ready empty Controllers workspace (#811)', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/studio/controllers')
    seedSignedInWorkspace()
    useControllerProfileStore.setState({ profiles: [], profilesLoaded: true })
    useControllerStore.setState({
      extensionPresent: true,
      detectExtension: async () => true,
    })

    render(<App />)

    const emptyState = screen.getByTestId('controller-profiles-empty-state')
    expect(within(emptyState).getByRole('heading', {
      name: 'Connect a Controller to create its profile.',
    })).toBeInTheDocument()

    await user.click(within(emptyState).getByRole('button', { name: 'Connect a Controller' }))

    expect(await screen.findByTestId('controller-ip-input')).toBeInTheDocument()
  })

  it('shows a graceful message for unknown paths whose action leads to the public Gallery', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/bogus')
    render(<App />)
    const message = screen.getByTestId('route-message')
    expect(message).toHaveTextContent('Nothing at this address')

    await user.click(within(message).getByRole('button', { name: 'Browse the Gallery' }))

    expect(window.location.pathname).toBe('/gallery')
    expect(screen.queryByTestId('route-message')).not.toBeInTheDocument()
  })

  it('opens the docs reader at /docs/<id> and redirects legacy hash links', () => {
    window.history.replaceState(null, '', '/#/docs/feature-guide')
    render(<App />)
    expect(window.location.pathname).toBe('/docs/feature-guide')
    expect(useDocsStore.getState().activeDocId).toBe('feature-guide')
  })

  it('renders public docs without mounting the Studio entity panes', () => {
    window.history.replaceState(null, '', '/docs/feature-guide')
    render(<App />)

    expect(screen.getByTestId('docs-reader')).toHaveTextContent('PXLBLZ — Feature Guide')
    expect(screen.queryByTestId('studio-rail')).not.toBeInTheDocument()
    expect(screen.queryByTestId('preview-pane')).not.toBeInTheDocument()
  })

  it('shows the document catalog beside the active public document', () => {
    window.history.replaceState(null, '', '/docs/feature-guide')
    render(<App />)

    const catalog = screen.getByTestId('docs-catalog')
    expect(within(catalog).getByRole('link', { name: /Feature Guide/ })).toHaveAttribute('aria-current', 'page')
    expect(within(catalog).getByRole('link', { name: /Ecosystem Primer/ })).toBeInTheDocument()
    expect(within(catalog).getByRole('link', { name: 'View source' })).toHaveAttribute(
      'href',
      expect.stringContaining('PXLBLZ%20Feature%20Guide.md'),
    )
    expect(within(catalog).getByRole('link', { name: 'Report a bug' })).toHaveAttribute(
      'href',
      'https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues',
    )
  })

  it('uses Docs and API as direct reference places in the top-bar control (#965)', async () => {
    window.history.replaceState(null, '', '/gallery')
    render(<App />)

    await choosePlace('Docs')
    expect(window.location.pathname).toBe('/docs')
    expect(screen.getByTestId('docs-workspace')).toBeInTheDocument()
    expect(screen.queryByTestId('docs-menu-dropdown')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Docs' })).toHaveAttribute('aria-haspopup', 'listbox')

    await choosePlace('API')
    expect(window.location.pathname).toBe('/reference')
    expect(screen.getByTestId('api-reference-workspace')).toBeInTheDocument()
    expect(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'API' })).toHaveAttribute('aria-haspopup', 'listbox')
  })

  it('renders the public API reference without mounting Studio panes', () => {
    window.history.replaceState(null, '', '/reference/Anim')
    render(<App />)

    const workspace = screen.getByTestId('api-reference-workspace')
    expect(workspace).toHaveTextContent('Anim.easeIn2(t)')
    expect(within(workspace).getByRole('link', { name: /Pixelblaze/ })).toBeInTheDocument()
    expect(screen.queryByTestId('studio-rail')).not.toBeInTheDocument()
    expect(screen.queryByTestId('preview-pane')).not.toBeInTheDocument()
  })

  it('appends personal API documentation in Studio context without exposing source', () => {
    window.history.replaceState(null, '', '/reference/personal%3Alib-1')
    useReferenceNavigationStore.setState({ studioContext: true })
    useLibraryStore.setState({
      userLibraries: [{
        id: 'lib-1',
        name: 'MyLib',
        src: '// Paint one pixel.\nfunction paint(index) { hsv(index, 1, 1) }',
        updatedAt: 1,
      }],
      librariesLoaded: true,
    })
    render(<App />)

    const workspace = screen.getByTestId('api-reference-workspace')
    expect(workspace).toHaveTextContent('My libraries')
    expect(workspace).toHaveTextContent('MyLib.paint(index)')
    expect(within(workspace).getByRole('link', { name: 'Edit in Libraries' })).toHaveAttribute(
      'href',
      '/studio/libraries/lib-1',
    )
    expect(workspace).not.toHaveTextContent('hsv(index, 1, 1)')
  })

  it('renders the Gallery grid at /gallery', () => {
    window.history.replaceState(null, '', '/gallery')
    render(<App />)
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Gallery')
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
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Gallery')
  })

  it('persists broken Pattern source on departure and reopens it without stale pixels (#818)', async () => {
    const user = userEvent.setup()
    const pattern: PatternRecord = {
      id: 'broken-navigation-pattern',
      name: 'Broken navigation bench',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: 1,
    }
    const brokenSource = 'export function render(index) { var = 3 }'
    window.history.replaceState(null, '', `/studio/patterns/${pattern.id}`)
    seedSignedInWorkspace()
    stubRemotePatterns([pattern])
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    render(<App />)
    await waitFor(() => expect(usePatternStore.getState().activePatternId).toBe(pattern.id))
    act(() => useEditorStore.setState({
      source: brokenSource,
      bufferEdited: true,
      compileStatus: 'broken',
      previewSource: pattern.src,
      previewPatternName: pattern.name,
      isReadOnly: false,
    }))

    await user.click(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Gallery' }))

    expect(screen.queryByRole('alertdialog', { name: 'Discard broken source?' })).not.toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe('/gallery'))
    expect(screen.getByTestId('gallery-page')).toHaveTextContent('Gallery')
    expect(usePatternStore.getState().userPatterns[0]?.src).toBe(brokenSource)
    expect(useEditorStore.getState()).toMatchObject({
      source: brokenSource,
      previewSource: '',
      previewUnavailableReason: 'broken-source',
      previewPatternName: pattern.name,
      compileStatus: 'broken',
      bufferEdited: false,
    })

    await user.click(within(screen.getByTestId('top-bar')).getByRole('button', { name: 'Studio' }))

    await waitFor(() => expect(screen.getByTestId('preview-unavailable')).toBeInTheDocument())
    expect(screen.getByTestId('preview-unavailable')).toHaveTextContent('Fix the source errors to restart it.')
    expect(useEditorStore.getState().source).toBe(brokenSource)
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

  it('keeps the global Controller surface visible on gallery, detail, studio, docs, and API routes (#323)', () => {
    const routes = ['/gallery', '/p/iridescent-fibers', '/studio', '/docs/feature-guide', '/reference/Anim']

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
    const editorPane = within(screen.getByTestId('editor-pane'))
    await userEvent.click(editorPane.getByRole('button', { name: 'Pattern actions' }))
    expect(editorPane.getByRole('menuitem', { name: 'View in Gallery' })).toBeInTheDocument()
    expect(editorPane.getByRole('menuitem', { name: 'Clone into Patterns' })).toBeInTheDocument()
  })

  it('does not offer a Gallery route for a Studio-only Test Pattern (#785)', async () => {
    window.history.replaceState(null, '', '/studio/patterns/TestPattern1D')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: true,
      personalWorkspaceResolved: true,
    })
    stubRemotePatterns()
    render(<App />)

    await waitFor(() => expect(usePatternStore.getState().activeDemoName).toBe('TestPattern1D'))
    const editorPane = within(screen.getByTestId('editor-pane'))
    await userEvent.click(editorPane.getByRole('button', { name: 'Pattern actions' }))

    expect(editorPane.queryByRole('menuitem', { name: 'View in Gallery' })).not.toBeInTheDocument()
    expect(editorPane.getByRole('menuitem', { name: 'Clone into Patterns' })).toBeInTheDocument()
  })

  it('reports, dismisses, and retries a failed stock Pattern Clone without opening a ghost record', async () => {
    window.history.replaceState(null, '', '/studio/patterns/TestPattern1D')
    seedSignedInWorkspace()
    openDemoPattern('TestPattern1D')
    const addPattern = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValue(undefined)
    usePatternStore.setState({ addPattern })
    const user = userEvent.setup()
    render(<App />)
    const editorPane = within(screen.getByTestId('editor-pane'))

    await user.click(editorPane.getByRole('button', { name: 'Pattern actions' }))
    await user.click(editorPane.getByRole('menuitem', { name: 'Clone into Patterns' }))

    let notice = await editorPane.findByRole('alert')
    expect(notice).toHaveTextContent('Could not clone pattern "TestPattern1D".')
    expect(usePatternStore.getState().activePatternId).toBeNull()
    const attemptedRecord = addPattern.mock.calls[0]?.[0] as PatternRecord
    await user.click(within(notice).getByRole('button', { name: 'Dismiss clone pattern notice' }))
    expect(editorPane.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(editorPane.getByRole('button', { name: 'Pattern actions' }))
    await user.click(editorPane.getByRole('menuitem', { name: 'Clone into Patterns' }))
    notice = await editorPane.findByRole('alert')
    await user.click(within(notice).getByRole('button', { name: 'Retry clone pattern' }))

    expect(addPattern).toHaveBeenCalledTimes(3)
    expect((addPattern.mock.calls[1]?.[0] as PatternRecord).id).not.toBe(attemptedRecord.id)
    expect(addPattern.mock.calls[2]?.[0]).toBe(addPattern.mock.calls[1]?.[0])
    expect(editorPane.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports and retries a failed permanent Pattern Delete without navigating early', async () => {
    const pattern: PatternRecord = { id: 'delete-me', name: 'Delete Me', src: 'export function render(index) {}', controls: {}, updatedAt: 1 }
    window.history.replaceState(null, '', `/studio/patterns/${pattern.id}`)
    seedSignedInWorkspace()
    const removePattern = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true, activePatternId: pattern.id, removePattern })
    useEditorStore.setState({ source: pattern.src, previewSource: pattern.src, isReadOnly: false })
    const user = userEvent.setup()
    render(<App />)
    const editorPane = within(screen.getByTestId('editor-pane'))

    await user.click(editorPane.getByRole('button', { name: 'Pattern actions' }))
    await user.click(editorPane.getByRole('menuitem', { name: 'Delete pattern' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete pattern?' })
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    const notice = await editorPane.findByRole('alert')
    expect(notice).toHaveTextContent('Could not delete pattern "Delete Me".')
    expect(window.location.pathname).toBe(`/studio/patterns/${pattern.id}`)
    expect(usePatternStore.getState().activePatternId).toBe(pattern.id)

    await user.click(within(notice).getByRole('button', { name: 'Retry delete pattern' }))

    expect(removePattern).toHaveBeenCalledTimes(2)
    expect(removePattern).toHaveBeenNthCalledWith(1, pattern.id)
    expect(removePattern).toHaveBeenNthCalledWith(2, pattern.id)
    await waitFor(() => expect(window.location.pathname).toBe('/studio/patterns'))
    expect(editorPane.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show an empty actions menu for a signed-out Test Pattern (#785)', async () => {
    window.history.replaceState(null, '', '/studio/patterns/TestPattern1D')
    useWorkspaceStore.setState({
      personalWorkspaceAuthenticated: false,
      personalWorkspaceResolved: true,
    })
    openDemoPattern('TestPattern1D')
    render(<App />)

    await waitFor(() => expect(usePatternStore.getState().activeDemoName).toBe('TestPattern1D'))
    expect(screen.getByTestId('editor-pane')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pattern actions' })).not.toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Pattern actions' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View code' }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-code-stage')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Studio' })).toBeInTheDocument()
  })

  it('uses the unenclosed Pattern-detail rail and informational dimension fact', () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)

    const page = screen.getByTestId('pattern-detail-page')
    const rail = page.querySelector('aside')
    expect(rail).not.toHaveClass('rounded-lg', 'border', 'bg-panel')
    expect(rail?.querySelector('[data-pattern-dimension]')).not.toHaveClass('rounded', 'border')
    expect(within(rail as HTMLElement).getByTestId('pattern-detail-preview-band')).toHaveClass(
      'border-y',
      'border-seam',
    )
  })

  it('toggles the preview with Space on the pattern detail page but not in the Gallery grid', async () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    render(<App />)
    expect(await screen.findByTestId('pattern-detail-page')).toBeInTheDocument()

    const wasRunning = usePreviewStore.getState().isRunning
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(!wasRunning)
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(wasRunning)

    act(() => {
      useRouterStore.getState().navigate({ kind: 'gallery' })
    })
    const galleryRunning = usePreviewStore.getState().isRunning
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(galleryRunning)
  })

  it('shows the display selector in the detail header for 2D patterns only', () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    const { rerender } = render(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('IridescentFibers')
    const minorRow = screen.getByTestId('pattern-detail-minor-row')
    expect(minorRow).toHaveTextContent('display')
    expect(within(minorRow).getByRole('button', { name: 'Display' })).toBeInTheDocument()

    window.history.replaceState(null, '', '/p/aurora-sphere')
    act(() => {
      useRouterStore.getState().syncFromLocation()
    })
    rerender(<App />)
    expect(screen.getByTestId('pattern-detail-page')).toHaveTextContent('AuroraSphere')
    expect(screen.queryByRole('button', { name: 'Display' })).not.toBeInTheDocument()
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

  it('keeps reset in the detail minor row when a display selector anchors it', () => {
    window.history.replaceState(null, '', '/p/iridescent-fibers')
    usePatternStore.setState({
      demoOverrides: { IridescentFibers: { surfaceId: 'cylinder' } },
    })
    render(<App />)
    const minorRow = screen.getByTestId('pattern-detail-minor-row')
    expect(within(minorRow).getByRole('button', { name: 'Display' })).toBeInTheDocument()
    expect(within(minorRow).getByRole('button', { name: 'Reset preview' })).toHaveTextContent('Reset')
  })
})
