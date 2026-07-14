import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { useMixinStore, mixinInitialState, type MixinRecord } from '@/store/mixinStore'
import { useLibraryStore, libraryInitialState, type LibraryRecord } from '@/store/libraryStore'
import {
  controllerProfileInitialState,
  useControllerProfileStore,
  type ControllerProfile,
} from '@/store/controllerProfileStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { getAuthSession } from '@/engine/authSession'
import { useRouterStore, routerInitialState } from '@/store/routerStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { stampArtifact } from '@/engine/artifactStamp'

vi.mock('@/engine/authSession', () => ({
  getAuthSession: vi.fn(),
}))

const SEED_PATTERN = { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 }

let mockMaps: MapRecord[] = []
let mockMixins: MixinRecord[] = []
let mockLibraries: LibraryRecord[] = []
let mockControllers: ControllerProfile[] = []
let requests: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mockMaps = []
  mockMixins = []
  mockLibraries = []
  mockControllers = []
  requests = []
  vi.mocked(getAuthSession).mockResolvedValue({
    authenticated: true,
    user: {
      id: 'github:123',
      primaryProvider: 'github',
      primaryHandle: 'tester',
      githubUserId: '123',
      githubLogin: 'tester',
      displayName: 'Tester',
      avatarUrl: '',
      identities: [
        {
          provider: 'github',
          providerUserId: '123',
          handle: 'tester',
          email: null,
          emailVerified: null,
        },
      ],
    },
  })
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    requests.push({ url: String(url), init })
    if (String(url) === '/api/patterns' && init?.method === undefined) {
      return Response.json({ patterns: [SEED_PATTERN] })
    }
    if (String(url) === '/api/maps' && init?.method === undefined) {
      return Response.json({ maps: mockMaps })
    }
    if (String(url) === '/api/mixins' && init?.method === undefined) {
      return Response.json({ mixins: mockMixins })
    }
    if (String(url) === '/api/libraries' && init?.method === undefined) {
      return Response.json({ libraries: mockLibraries })
    }
    if (String(url) === '/api/libraries' && init?.method === 'POST') {
      const record = JSON.parse(String(init.body)) as LibraryRecord
      mockLibraries = [record, ...mockLibraries]
      return Response.json({ library: record }, { status: 201 })
    }
    if (String(url).startsWith('/api/libraries/') && init?.method === 'PATCH') {
      const id = String(url).replace('/api/libraries/', '')
      const changes = JSON.parse(String(init.body)) as Partial<LibraryRecord>
      mockLibraries = mockLibraries.map((library) => library.id === id ? { ...library, ...changes } : library)
      return Response.json({ ok: true })
    }
    if (String(url).startsWith('/api/libraries/') && init?.method === 'DELETE') {
      const id = String(url).replace('/api/libraries/', '')
      mockLibraries = mockLibraries.filter((library) => library.id !== id)
      return Response.json({ ok: true })
    }
    if (String(url) === '/api/controllers' && init?.method === undefined) {
      return Response.json({ controllers: mockControllers })
    }
    if (String(url) === '/api/shows' && init?.method === undefined) {
      return Response.json({ shows: [] })
    }
    if (String(url).startsWith('/api/settings/') && init?.method === undefined) {
      return Response.json({})
    }
    return Response.json({ ok: true })
  }))
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useMixinStore.setState(mixinInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowStore.setState(showInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  useRouterStore.setState(routerInitialState)
  window.history.replaceState(null, '', '/studio')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const CUSTOM_MAP: MapRecord = {
  id: 'm1',
  name: 'My Tree',
  dim: 3,
  generator: 'custom',
  params: {},
  points: [[0.1, 0.2, 0.3]],
  updatedAt: 1000,
}

const CUSTOM_MIXIN: MixinRecord = {
  id: 'mx1',
  name: 'tazii-crown-mask',
  kind: 'intercept',
  src: '// @param BRIGHTNESS scalar\n// @target hsv\n// @wraps hsv-call\nexport var x = 0',
  updatedAt: 1000,
}

const CONTROLLER_PROFILE: ControllerProfile = {
  id: 'ctrl-1',
  name: 'Old alias',
  deviceId: 'pixelblaze_pb32_3cd4ee549434',
  lastKnownDeviceName: 'Burner bag',
  board: { kind: 'pixelblaze-v3-standard' },
  inputs: [],
  globalTransforms: [],
  patternBindings: [],
  zones: [],
  updatedAt: 1000,
}

async function switchToMaps(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Maps' }))
}

async function switchToMixins(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Mixins' }))
}

describe('PatternList', () => {
  it('renders Patterns with one list header carrying create actions', async () => {
    render(<PatternList />)

    expect(await screen.findAllByText('Patterns')).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'Open pattern from .epe file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New pattern' })).toBeInTheDocument()
  })

  it('creates a new pattern from the Patterns title row', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(await screen.findByRole('button', { name: 'New pattern' }))

    expect(await screen.findByText('Untitled Pattern')).toBeInTheDocument()
    expect(usePatternStore.getState().activePatternId).not.toBeNull()
  })

  it('restores an imported artifact preferred stock map for preview (#411)', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    const source = stampArtifact('export function render2D(index, x, y) {}', {
      kind: 'show',
      id: 'show-import',
      preferredMap: { kind: 'stock', id: 'wide', name: 'Wide 2:1' },
      compatibility: {
        portability: 'adaptive',
        dimensions: [2],
        mapClasses: ['surface'],
        resolution: 'adaptive',
        exactMap: false,
      },
      stampedAt: '2026-07-12T00:00:00.000Z',
    })
    const file = new File([
      JSON.stringify({ name: 'Imported adaptive Show', sources: { main: source } }),
    ], 'adaptive-show.epe', { type: 'application/json' })

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)

    await waitFor(() => expect(usePatternStore.getState().activePatternId).not.toBeNull())
    const imported = usePatternStore.getState().userPatterns.find((pattern) => pattern.name === 'Imported adaptive Show')
    expect(imported?.settings?.mapId).toBe('wide')
    expect(useMapStore.getState().activeMapId).toBe('wide')
  })

  it('imports source while disclosing a missing preferred custom map (#411)', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    const source = stampArtifact('export function render2D(index, x, y) {}', {
      kind: 'show',
      id: 'show-custom-map',
      preferredMap: { kind: 'custom', name: 'Measured wall' },
      compatibility: {
        portability: 'installation-bound',
        dimensions: [2],
        mapClasses: ['custom'],
        resolution: 'fixed',
        exactMap: true,
      },
      stampedAt: '2026-07-12T00:00:00.000Z',
    })
    const file = new File([
      JSON.stringify({ name: 'Installation Show', sources: { main: source } }),
    ], 'installation-show.epe', { type: 'application/json' })

    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file)

    expect(await screen.findByText(/Preferred custom map "Measured wall" is not available/)).toBeInTheDocument()
    expect(await screen.findByText('Installation Show')).toBeInTheDocument()
    expect(useMapStore.getState().activeMapId).toBe(mapInitialState.activeMapId)
  })

  it('opens IridescentFibers for visitors without a saved last-active pattern', async () => {
    vi.mocked(getAuthSession).mockResolvedValueOnce({ authenticated: false })
    render(<PatternList />)

    await waitFor(() => {
      expect(usePatternStore.getState().activeDemoName).toBe('IridescentFibers')
    })
    expect(usePatternStore.getState().activePatternId).toBeNull()
    expect(useEditorStore.getState().previewPatternName).toBe('IridescentFibers')
    expect(useEditorStore.getState().previewSource).toBe(DEMOS.IridescentFibers)
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(false)
    expect(await screen.findByText('Sign in')).toBeInTheDocument()
  })

  it('lists built-in patterns in a collapsible Patterns section and opens them read-only', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    expect(await screen.findByRole('button', { name: 'Built-in Patterns' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByText('AuroraSphere'))

    expect(window.location.pathname).toBe('/studio/patterns/AuroraSphere')
    expect(usePatternStore.getState().activeDemoName).toBe('AuroraSphere')
    expect(useEditorStore.getState().isReadOnly).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Built-in Patterns' }))
    expect(screen.queryByText('AuroraSphere')).not.toBeInTheDocument()
  })

  it('renders the six-entity activity strip plus Catalog entry', async () => {
    render(<PatternList />)

    expect(await screen.findByRole('radio', { name: 'Patterns' })).toHaveAttribute('aria-checked', 'true')
    for (const name of ['Maps', 'Mixins', 'Libraries', 'Controllers', 'Shows']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeInTheDocument()
  })

  it('opens a stock library read-only from the Libraries rail without changing preview source', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    const previewSourceBefore = useEditorStore.getState().previewSource

    await user.click(screen.getByRole('radio', { name: 'Libraries' }))

    expect(await screen.findByRole('button', { name: 'Stock Libraries' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('No cloud libraries yet')).toBeInTheDocument()

    await user.click(screen.getByText('Shader'))

    expect(window.location.pathname).toBe('/studio/libraries/Shader')
    expect(usePatternStore.getState().activeLibraryName).toBe('Shader')
    expect(useEditorStore.getState().source).toContain('function fract')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(useEditorStore.getState().previewSource).toBe(previewSourceBefore)

    await user.click(screen.getByRole('radio', { name: 'Maps' }))
    expect(window.location.pathname).toBe('/studio/maps')
    await user.click(screen.getByRole('radio', { name: 'Libraries' }))
    expect(window.location.pathname).toBe('/studio/libraries/Shader')
  })

  it('creates a cloud library from the Libraries title row and opens it editable', async () => {
    mockLibraries = [{
      id: 'lib-existing',
      name: 'Lib1',
      src: 'function existing(v) { return v }',
      updatedAt: 1,
    }]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(await screen.findByRole('radio', { name: 'Libraries' }))
    await user.click(await screen.findByRole('button', { name: 'New library' }))

    expect(await screen.findByText('Lib2')).toBeInTheDocument()
    expect(window.location.pathname).toMatch(/^\/studio\/libraries\//)
    expect(useLibraryStore.getState().editingLibrary?.kind).toBe('existing')
    expect(usePatternStore.getState().activeLibraryName).toBe('Lib2')
    expect(useEditorStore.getState().editorFlavor).toBe('library')
    expect(useEditorStore.getState().isReadOnly).toBe(false)
    expect(requests.map((request) => [request.url, request.init?.method ?? 'GET'])).toContainEqual([
      '/api/libraries',
      'POST',
    ])
  })

  it('selects entity kinds through /studio/<kind> routes', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Mixins' }))

    expect(window.location.pathname).toBe('/studio/mixins')
    expect(screen.getAllByText('Mixins')).toHaveLength(1)
  })

  it('opens provisional Show creation without creating a record', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Shows' }))
    await user.click(await screen.findByRole('button', { name: 'New show' }))

    expect(useShowStore.getState().showCreation).toEqual({ previousShowId: null })
    expect(useShowStore.getState().shows).toEqual([])
    expect(requests.some(({ url, init }) => url === '/api/shows' && init?.method === 'POST')).toBe(false)
    expect(window.location.pathname).toBe('/studio/shows')
  })

  it('shows the empty state when there are no custom maps', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText(/No custom maps yet/i)).toBeInTheDocument()
  })

  it('lists user-authored custom maps under Maps', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()
    expect(screen.getAllByText('Maps')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'New map' })).toBeInTheDocument()
  })

  it('creates a new map from the Maps title row', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)

    await user.click(await screen.findByRole('button', { name: 'New map' }))

    expect(await screen.findByText('Untitled Map')).toBeInTheDocument()
    expect(useMapStore.getState().editingMap?.kind).toBe('existing')
  })

  it('lists durable controller profiles under Controllers', async () => {
    mockControllers = [CONTROLLER_PROFILE]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Controllers' }))

    expect(await screen.findByText('Burner bag')).toBeInTheDocument()
    expect(screen.queryByText('Old alias')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New controller profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /search by name/i })).not.toBeInTheDocument()
  })

  it('lists user-authored cloud mixins under Mixins', async () => {
    mockMixins = [CUSTOM_MIXIN]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMixins(user)
    const mixinRow = (await screen.findByText('tazii-crown-mask')).closest('li')
    expect(mixinRow).not.toBeNull()
    expect(within(mixinRow!).getByText('intercept')).toBeInTheDocument()
  })

  it('collapses and expands stock mixins in a muted Mixins section', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMixins(user)

    expect(screen.getByRole('button', { name: 'Stock Mixins' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('pot-binding')).toBeInTheDocument()
    expect(screen.getByText('hw-brightness')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stock Mixins' }))

    expect(screen.getByRole('button', { name: 'Stock Mixins' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('pot-binding')).not.toBeInTheDocument()
  })

  it('opens a revealed stock mixin read-only at a stable mixin route', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMixins(user)

    await user.click(screen.getByText('pot-binding'))

    expect(window.location.pathname).toBe('/studio/mixins/pot-binding')
    expect(useMixinStore.getState().editingMixin).toEqual({ kind: 'stock', id: 'pot-binding' })
    expect(useEditorStore.getState().editorFlavor).toBe('mixin')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
  })

  it('collapses and expands stock maps in a muted Maps section', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)

    expect(screen.getByRole('button', { name: 'Stock Maps' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Cube shell')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stock Maps' }))

    expect(screen.getByRole('button', { name: 'Stock Maps' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Cube shell')).not.toBeInTheDocument()
  })

  it('opens a stock map family at its natural coordinate view while revealing alternatives', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)

    await user.click(screen.getByText('Square'))

    expect(window.location.pathname).toBe('/studio/maps/plane')
    expect(useMapStore.getState().editingMap).toEqual({ kind: 'stock', id: 'plane' })
    expect(useEditorStore.getState().editorFlavor).toBe('map')
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(screen.getByRole('button', { name: 'Square Strand 1D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Square Surface 2D' })).toBeInTheDocument()
  })

  it('groups stock maps by physical type and nests Cylinder coordinate views', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)

    for (const label of ['Paths', 'Surfaces', 'Shells', 'Volumes', 'Custom / imported']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(
      screen.getByText('Custom / imported').compareDocumentPosition(screen.getByText('Paths'))
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('Ring').closest('[role="button"]')).toHaveClass('text-xs', 'text-zinc-500')
    const squareSummary = screen.getByText('Square').closest('summary')
    expect(squareSummary).toHaveClass('text-xs', 'text-zinc-500')
    expect(squareSummary?.closest('li')).toHaveClass('min-h-[19px]', 'py-px')
    expect(screen.getAllByText('Cylinder')).toHaveLength(1)
    await user.click(screen.getByText('Cylinder'))
    expect(screen.getByRole('button', { name: 'Cylinder Strand 1D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cylinder Surface 2D' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cylinder Spatial 3D' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cylinder Spatial 3D' }))
    expect(window.location.pathname).toBe('/studio/maps/cylinder-spatial')
    expect(useMapStore.getState().editingMap).toEqual({ kind: 'stock', id: 'cylinder-spatial' })
  })

  it('keeps a family recognizable when the dimension lens leaves one view', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    await user.click(screen.getByRole('radio', { name: '1D' }))

    expect(screen.getByText('Cylinder')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cylinder Surface 2D' })).not.toBeInTheDocument()
    expect(screen.getByText('Cube shell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cube shell Spatial 3D' })).not.toBeInTheDocument()
  })

  it('shows the 1D dimension lens in Maps mode', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    expect(screen.getByRole('radio', { name: '1D' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2D' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3D' })).toBeInTheDocument()
  })

  it('preserves the 1D dimension lens when entering Maps mode', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: '1D' }))
    expect(screen.getByRole('radio', { name: '1D' })).toHaveAttribute('aria-checked', 'true')

    await switchToMaps(user)

    expect(screen.getByRole('radio', { name: '1D' })).toHaveAttribute('aria-checked', 'true')
  })

  it('filters the Maps rail to true 1D maps', async () => {
    mockMaps = [
      CUSTOM_MAP,
      {
        ...CUSTOM_MAP,
        id: 'map-1d',
        name: 'Reverse strand',
        dim: 1,
        points: [[1], [0]],
        source: '[[1], [0]]',
      },
    ]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: '1D' }))
    await switchToMaps(user)

    expect(await screen.findByText('Reverse strand')).toBeInTheDocument()
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
  })

  it('filters maps by name via the type-down search box', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.type(search, 'tree')
    expect(screen.getByText('My Tree')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'xyz')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
  })

  it('does not show the "no maps yet" empty state when a filter merely empties the list', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /search by name/i }), 'nope')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
    // Header stays, but the genuine-empty message must not appear.
    expect(screen.getAllByText('Maps')).toHaveLength(1)
    expect(screen.queryByText('No custom maps yet')).not.toBeInTheDocument()
  })

  it('AND-combines the search query with the dimension lens', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    // Query matches but lens (2D) does not -> hidden.
    await user.type(screen.getByRole('textbox', { name: /search by name/i }), 'tree')
    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    // Both match -> visible.
    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('filters patterns by name via the type-down search box', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    expect(await screen.findByText('Seed Pattern')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.type(search, 'nope')
    expect(screen.queryByText('Seed Pattern')).not.toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'seed')
    expect(screen.getByText('Seed Pattern')).toBeInTheDocument()

    await user.clear(search)
    expect(screen.getByText('Seed Pattern')).toBeInTheDocument()
  })

  it('clicking the search icon focuses the input', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })
    expect(search).not.toHaveFocus()

    await user.click(screen.getByRole('button', { name: /search by name/i }))
    expect(search).toHaveFocus()
  })

  it('clicking the icon while open closes and unfocuses the search input', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })

    // Open + focus it; the icon now offers Close.
    await user.click(screen.getByRole('button', { name: /search by name/i }))
    expect(search).toHaveFocus()
    const closeBtn = screen.getByRole('button', { name: /close search/i })

    // Clicking Close drops focus and clears any query.
    await user.type(search, 'abc')
    await user.click(closeBtn)
    expect(search).not.toHaveFocus()
    expect(search).toHaveValue('')
    // And the affordance reverts to "Search by name".
    expect(screen.getByRole('button', { name: /search by name/i })).toBeInTheDocument()
  })

  it('clicking elsewhere in the IDE closes the search box and clears its query', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.click(screen.getByRole('button', { name: /search by name/i }))
    await user.type(search, 'abc')
    expect(search).toHaveFocus()

    // A click on an unrelated part of the rail blurs the input.
    await user.click(screen.getByText('Patterns'))

    expect(search).not.toHaveFocus()
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: /search by name/i })).toBeInTheDocument()
  })

  it('shows a 3D custom map under the 3D lens but not the 2D lens', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('the Catalog entry navigates to the Gallery', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await user.click(screen.getByRole('button', { name: 'Catalog' }))
    expect(window.location.pathname).toBe('/gallery')
  })
})
