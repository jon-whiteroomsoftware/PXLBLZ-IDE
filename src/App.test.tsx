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

  it('collapses the shared library to its activity strip without changing entity mode automatically (#466)', async () => {
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    render(<App />)

    const pane = screen.getByTestId('left-pane')
    expect(pane).toHaveStyle({ width: '216px', maxWidth: '34vw' })
    expect(screen.queryByRole('button', { name: 'Catalog' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse rail' }))
    expect(pane).toHaveStyle({ width: '46px' })
    expect(screen.getByRole('radiogroup', { name: 'Studio activity' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Patterns' })).toHaveClass('text-[10px]')
    expect(screen.getByRole('radio', { name: 'Maps' })).toHaveClass('text-zinc-400')
    expect(screen.getByRole('button', { name: 'Expand library' })).toHaveClass(
      'absolute',
      'left-1/2',
      'top-1',
      'size-7',
      '-translate-x-1/2',
    )
    expect(screen.getByRole('button', { name: 'Expand library' })).not.toHaveTextContent('OPEN')

    await userEvent.click(screen.getByRole('radio', { name: 'Shows' }))
    expect(screen.getByRole('button', { name: 'Expand library' })).toBeInTheDocument()
    expect(pane).toHaveStyle({ width: '46px' })

    await userEvent.click(screen.getByRole('radio', { name: 'Patterns' }))
    expect(screen.getByRole('radio', { name: 'Patterns' })).toHaveAttribute('aria-checked', 'true')
    expect(pane).toHaveStyle({ width: '46px' })

    await userEvent.click(screen.getByRole('button', { name: 'Expand library' }))
    expect(pane).toHaveStyle({ width: '216px', maxWidth: '34vw' })
    expect(screen.getByRole('button', { name: 'Collapse rail' })).toBeInTheDocument()
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

    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '387px' })
  })

  it('remembers right-pane width per Studio mode instead of leaking it across modes (#63)', async () => {
    vi.stubGlobal('innerWidth', 1440)
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    const { container } = render(<App />)

    const splitters = container.querySelectorAll('.cursor-col-resize')
    const rightSplitter = splitters[splitters.length - 1]
    fireEvent.mouseDown(rightSplitter, { clientX: 800 })
    fireEvent(window, new MouseEvent('mousemove', { clientX: 600 }))
    fireEvent(window, new MouseEvent('mouseup'))
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '660px' })

    await userEvent.click(screen.getByRole('radio', { name: 'Shows' }))
    expect(screen.getByTestId('preview-pane')).toHaveStyle({ width: '460px', minWidth: '300px' })
    expect(within(screen.getByTestId('show-workspace')).getByRole('separator', { name: 'Resize preview pane' })).toBeVisible()

    await userEvent.click(screen.getByRole('radio', { name: 'Patterns' }))
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
    window.history.replaceState(null, '', '/studio/shows/show-header')
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

  it('keeps Controller profile titles non-editable', () => {
    window.history.replaceState(null, '', '/studio/controllers/ctrl-1')
    seedSignedInWorkspace()
    useControllerProfileStore.setState({ profiles: [controllerProfile], profilesLoaded: true })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    expect(within(editorPane).getAllByText('Pixelblaze shelf').length).toBeGreaterThan(0)
    expect(within(editorPane).queryByRole('button', { name: /Rename controller/ })).not.toBeInTheDocument()
  })

  it('puts Show details and quiet Show metadata in the title row', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-header', 'Simplest possible show', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    window.history.replaceState(null, '', '/studio/shows/show-header')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    expect(within(editorPane).getAllByText('Simplest possible show').length).toBeGreaterThan(0)
    expect(within(editorPane).getByTitle('Show output summary')).toHaveTextContent('Portable 2D')
    expect(within(editorPane).getByTitle('Show output summary')).not.toHaveTextContent(/scene/i)
    expect(within(editorPane).getByRole('button', { name: 'Show properties' }).querySelector('.show-header-action-label')).toHaveTextContent('Properties')
    expect(within(editorPane).getByRole('button', { name: 'View code' }).querySelector('.show-header-action-label')).toHaveTextContent('View code')
    expect(within(editorPane).getByRole('button', { name: 'Export Show as .epe' }).querySelector('.show-header-action-label')).toHaveTextContent('.epe')
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
    window.history.replaceState(null, '', '/studio/shows/show-narrow-stage')
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
    expect(within(screen.getByTestId('preview-pane')).getByLabelText('Show stage')).toBeInTheDocument()

    vi.stubGlobal('innerWidth', 900)
    fireEvent(window, new Event('resize'))
    await user.click(previewStage)
    const reopenedDialog = screen.getByRole('dialog', { name: 'Show Stage preview' })
    const close = within(reopenedDialog).getByRole('button', { name: 'Close Stage preview' })
    expect(close).toHaveFocus()
    await user.click(close)
    expect(screen.queryByRole('dialog', { name: 'Show Stage preview' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage')).not.toBeInTheDocument()
    await waitFor(() => expect(previewStage).toHaveFocus())
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
    window.history.replaceState(null, '', '/studio/shows/show-narrow-playback')
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
    await user.click(screen.getByRole('button', { name: 'View code' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to show' })).toBeInTheDocument())
    await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))
    runFrame(200)
    runFrame(220)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState().positionMs).toBeGreaterThan(positionBeforeCode)

    await user.click(screen.getByRole('button', { name: 'Back to show' }))
    vi.stubGlobal('innerWidth', 1200)
    fireEvent(window, new Event('resize'))

    expect(within(screen.getByTestId('preview-pane')).getByLabelText('Show stage')).toBeInTheDocument()
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it.each([
    ['narrow', 900, false],
    ['wide', 1200, true],
  ])('pauses inherited Pattern playback when navigating to a %s Show (#593)', async (_label, width, hasStage) => {
    const user = userEvent.setup()
    vi.stubGlobal('innerWidth', width)
    const show = createDefaultShow('show-narrow-inherited-playback', 'Inherited playback', 1000)
    window.history.replaceState(null, '', '/studio')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: null })

    render(<App />)
    act(() => usePreviewStore.setState({ isRunning: true }))
    await user.click(screen.getByRole('radio', { name: 'Shows' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument())

    expect(Boolean(within(screen.getByTestId('preview-pane')).queryByLabelText('Show stage'))).toBe(hasStage)
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
    window.history.replaceState(null, '', `/studio/shows/${first.id}`)
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
    window.history.replaceState(null, '', '/studio/shows/show-workspace-owner')
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [show], showsLoaded: true, activeShowId: show.id })

    render(<App />)

    const workspace = screen.getByTestId('show-workspace')
    const editor = screen.getByTestId('editor-pane')
    const stage = screen.getByTestId('preview-pane')

    expect(workspace).toContainElement(editor)
    expect(workspace).toContainElement(stage)
    expect(editor).toHaveClass('contents')
    expect(workspace).toHaveClass('max-[980px]:grid-cols-1')
    expect(stage).toHaveClass('max-[980px]:hidden')
    expect(stage).toHaveStyle({ width: '460px', minWidth: '300px' })
    const previewSplitter = within(workspace).getByRole('separator', { name: 'Resize preview pane' })
    expect(previewSplitter).toHaveClass('col-start-2', 'row-start-2')
    expect(previewSplitter).toHaveAttribute('tabindex', '0')
    expect(previewSplitter).toHaveAttribute('aria-valuemin', '300')
    expect(previewSplitter).toHaveAttribute('aria-valuenow', '460')
    fireEvent.mouseDown(previewSplitter, { clientX: 800 })
    fireEvent(window, new MouseEvent('mousemove', { clientX: 700 }))
    fireEvent(window, new MouseEvent('mouseup'))
    expect(stage).toHaveStyle({ width: '560px', minWidth: '300px' })
    fireEvent.keyDown(previewSplitter, { key: 'ArrowLeft' })
    expect(stage).toHaveStyle({ width: '570px', minWidth: '300px' })
    expect(previewSplitter).toHaveAttribute('aria-valuenow', '570')
    expect(within(workspace).getByText('Workspace owner')).toBeInTheDocument()
    expect(within(workspace).getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(within(workspace).getByLabelText('Show stage')).toBeInTheDocument()
    expect(within(workspace).getByRole('button', { name: 'Preview Stage' })).toHaveClass('max-[980px]:inline-flex')
  })

  it('gives the Show editor sole ownership of the global Space shortcut (#588)', () => {
    const show = createDefaultShow('show-space-owner', 'Space owner', 1000)
    show.outputContract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    window.history.replaceState(null, '', '/studio/shows/show-space-owner')
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
    window.history.replaceState(null, '', `/studio/shows/${stock.id}`)
    seedSignedInWorkspace()
    useShowStore.setState({ shows: [], showsLoaded: true, activeShowId: null })

    render(<App />)

    const editorPane = screen.getByTestId('editor-pane')
    expect(within(editorPane).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('Murmuration')
    expect(within(editorPane).getByRole('combobox', { name: 'Pattern 2' })).toHaveValue('IQPalettes')
    const selector = within(editorPane).getByRole('combobox', { name: 'Pattern 3' })
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

    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    fireEvent.keyDown(document.body, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(false)
    input.remove()

    const treeItem = screen.getAllByRole('treeitem').find((item) => item.textContent?.includes('TestPattern1D'))
    expect(treeItem).toBeDefined()
    fireEvent.keyDown(treeItem!, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggles a Show preview only once when shared and Show shortcuts are mounted', () => {
    const show = createDefaultShow('show-space-once', 'One toggle', 1000)
    window.history.replaceState(null, '', `/studio/shows/${show.id}`)
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
    it('surfaces an OAuth denial as a dismissible notice and strips the param from the URL', async () => {
      window.history.replaceState(null, '', '/?auth=not-allowed')
      render(<App />)

      const notice = screen.getByTestId('auth-result-notice')
      expect(notice).toHaveTextContent(/invite list/i)
      expect(window.location.search).toBe('')
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith('auth_result', {
        outcome: 'failure',
        code: 'not-allowed',
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
    expect(screen.getByTestId('editor-pane')).toHaveTextContent('Pixelblaze shelf')
    expect(screen.getByTestId('editor-pane')).not.toHaveTextContent('Burner bag')
    expect(screen.getByTestId('preview-pane')).toHaveTextContent('Saved programs')
    expect(screen.getByTestId('editor-pane')).not.toHaveTextContent('Saved programs')
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

  it('uses Docs and API as direct reference workspaces with an explicit return', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/gallery')
    render(<App />)

    const topBar = screen.getByTestId('top-bar')
    await user.click(within(topBar).getByRole('button', { name: 'Docs' }))
    expect(window.location.pathname).toBe('/docs')
    expect(screen.getByTestId('docs-workspace')).toBeInTheDocument()
    expect(screen.queryByTestId('docs-menu-dropdown')).not.toBeInTheDocument()

    await user.click(within(topBar).getByRole('button', { name: 'API' }))
    expect(window.location.pathname).toBe('/reference')
    expect(screen.getByTestId('api-reference-workspace')).toBeInTheDocument()

    await user.click(within(topBar).getByRole('button', { name: 'Back to Gallery' }))
    expect(window.location.pathname).toBe('/gallery')
    expect(screen.getByTestId('gallery-page')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'View code' }))
    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    expect(screen.getByTestId('pattern-code-stage')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))
    expect(screen.getByRole('menuitem', { name: 'View preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in Studio' })).toBeInTheDocument()
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
