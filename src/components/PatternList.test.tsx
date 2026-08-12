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
import { entityOrganizationInitialState, useEntityOrganizationStore } from '@/store/entityOrganizationStore'
import { stampArtifact } from '@/engine/artifactStamp'
import { createDefaultShow } from '@/engine/showModel'
import type { LastActive } from '@/engine/personalContentProvider'
import type { Settings } from '@/engine/settings'
import { studioOperationInitialState, useStudioOperationStore } from '@/store/studioOperationStore'

vi.mock('@/engine/authSession', () => ({
  getAuthSession: vi.fn(),
}))

const SEED_PATTERN = { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 }

let mockMaps: MapRecord[] = []
let mockPatterns = [SEED_PATTERN]
let mockMixins: MixinRecord[] = []
let mockLibraries: LibraryRecord[] = []
let mockControllers: ControllerProfile[] = []
let mockShows: ReturnType<typeof createDefaultShow>[] = []
let mockLastActive: LastActive | undefined
let mockDemoOverrides: Record<string, Partial<Settings>> | undefined
let requests: Array<{ url: string; init?: RequestInit }> = []
let blockedWrite: { path: string; method: string } | null = null

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mockMaps = []
  mockPatterns = [SEED_PATTERN]
  mockMixins = []
  mockLibraries = []
  mockControllers = []
  mockShows = []
  mockLastActive = undefined
  mockDemoOverrides = undefined
  requests = []
  blockedWrite = null
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
    if (blockedWrite?.path === String(url) && blockedWrite.method === init?.method) {
      return Response.json({ error: 'offline' }, { status: 503 })
    }
    if (String(url) === '/api/patterns' && init?.method === undefined) {
      return Response.json({ patterns: mockPatterns })
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
      return Response.json({ shows: mockShows })
    }
    if (String(url) === '/api/settings/lastActive' && init?.method === undefined) {
      return Response.json({ value: mockLastActive })
    }
    if (String(url) === '/api/settings/demoOverrides' && init?.method === undefined) {
      return Response.json({ value: mockDemoOverrides })
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
  useEntityOrganizationStore.setState(entityOrganizationInitialState)
  useWorkspaceStore.setState(workspaceInitialState)
  useRouterStore.setState(routerInitialState)
  useStudioOperationStore.setState(studioOperationInitialState)
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

function enableShowtime(path = '/studio') {
  window.history.replaceState(null, '', `${path}?showtime`)
  useRouterStore.getState().syncFromLocation()
}

async function selectDimension(
  user: ReturnType<typeof userEvent.setup>,
  dimension: 'All' | '1D' | '2D' | '3D',
) {
  await user.click(screen.getByRole('button', { name: 'Dimension filter' }))
  await user.click(screen.getByRole('option', { name: dimension }))
}

describe('PatternList', () => {
  it('restores persisted preview settings for an already-open built-in Pattern (#805)', async () => {
    usePatternStore.setState({ activeDemoName: 'PerlinKaleidoscope2D' })
    mockDemoOverrides = {
      PerlinKaleidoscope2D: { mapId: 'cylinder', pixelCount: 777 },
    }

    render(<PatternList />)

    await waitFor(() => {
      expect(usePatternStore.getState().demoOverrides.PerlinKaleidoscope2D).toEqual({
        mapId: 'cylinder',
        pixelCount: 777,
      })
    })
    expect(useMapStore.getState().activeMapId).toBe('cylinder')
    expect(useMapStore.getState().activePixelCount).toBe(777)
  })

  it('renders Patterns with one list header carrying create actions', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    expect(await screen.findAllByText('Patterns')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Open pattern from .epe file' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add pattern' }))
    expect(screen.getByRole('button', { name: 'New pattern' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open pattern from .epe file' })).toHaveLength(1)
  })

  it('lets long Pattern tree names establish horizontal overflow (#662)', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const scroller = await screen.findByTestId('pattern-list-scroll')
    expect(scroller).toHaveClass('overflow-x-auto')
    expect(await screen.findByRole('tree', { name: 'Patterns' })).toHaveClass('min-w-full')
    await user.click(screen.getByRole('treeitem', { name: /^FPS Heavyweights/ }))
    expect(await screen.findByText('RedlineMachinePortable')).toHaveClass('whitespace-nowrap')
  })

  it('creates a new pattern from the Patterns title row', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(await screen.findByRole('button', { name: 'Add pattern' }))
    await user.click(await screen.findByRole('button', { name: 'New pattern' }))

    expect(await screen.findByText('Untitled Pattern')).toBeInTheDocument()
    expect(usePatternStore.getState().activePatternId).not.toBeNull()
  })

  it.each([
    {
      entityKind: 'pattern', mode: 'Patterns', addButton: 'Add pattern', createButton: 'New pattern',
      path: '/api/patterns', createdName: 'Untitled Pattern', records: () => usePatternStore.getState().userPatterns,
    },
    {
      entityKind: 'map', mode: 'Maps', addButton: 'Add map', createButton: 'New map',
      path: '/api/maps', createdName: 'Untitled Map', records: () => useMapStore.getState().userMaps,
    },
    {
      entityKind: 'mixin', mode: 'Mixins', addButton: 'Add mixin', createButton: 'New mixin',
      path: '/api/mixins', createdName: 'Untitled Mixin', records: () => useMixinStore.getState().userMixins,
    },
    {
      entityKind: 'library', mode: 'Libraries', addButton: 'Add library', createButton: 'New library',
      path: '/api/libraries', createdName: 'Lib1', records: () => useLibraryStore.getState().userLibraries,
    },
  ] as const)('reports a failed $entityKind create in the rail and retries exactly one record', async ({
    entityKind,
    mode,
    addButton,
    createButton,
    path,
    createdName,
    records,
  }) => {
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    if (mode !== 'Patterns') await user.click(screen.getByRole('radio', { name: mode }))
    const beforePath = window.location.pathname
    const beforeCount = records().length
    blockedWrite = { path, method: 'POST' }

    await user.click(await screen.findByRole('button', { name: addButton }))
    await user.click(await screen.findByRole('button', { name: createButton }))

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent(`Could not create ${entityKind} "${createdName}".`)
    expect(records()).toHaveLength(beforeCount)
    expect(window.location.pathname).toBe(beforePath)

    blockedWrite = null
    await user.click(within(notice).getByRole('button', { name: `Retry create ${entityKind}` }))

    await waitFor(() => expect(records().filter((record) => record.name === createdName)).toHaveLength(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reconciles a partially failed Pattern Empty Trash and retries only the retained item', async () => {
    mockPatterns = [
      { id: 'trash-a', name: 'Trash A', src: '// a', controls: {}, updatedAt: 2 },
      { id: 'trash-b', name: 'Trash B', src: '// b', controls: {}, updatedAt: 1 },
    ]
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Trash A')

    for (const name of ['Trash A', 'Trash B']) {
      await user.click(screen.getByRole('button', { name: `More actions for ${name}` }))
      await user.click(screen.getByRole('button', { name: 'Move to Trash' }))
    }
    blockedWrite = { path: '/api/patterns/trash-b', method: 'DELETE' }
    await user.click(screen.getByRole('button', { name: 'Open Trash (2 items)' }))
    expect(screen.getByRole('button', { name: 'Back to Patterns' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Empty Trash' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Empty Trash?' })
    await user.click(within(dialog).getByRole('button', { name: 'Empty Trash' }))

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Could not empty Pattern Trash. 1 item was deleted; 1 item remains.')
    expect(screen.getByRole('button', { name: 'Back to Patterns' })).toBeVisible()
    expect(usePatternStore.getState().userPatterns.map((pattern) => pattern.id)).toEqual(['trash-b'])
    expect(useEntityOrganizationStore.getState().organizations.patterns.trash).toEqual([
      {
        node: { kind: 'entity', entityId: 'trash-b' },
        parentFolderId: null,
        index: 0,
        collapsedFolderIds: [],
      },
    ])

    blockedWrite = null
    await user.click(within(notice).getByRole('button', { name: 'Retry empty Pattern Trash' }))

    await waitFor(() => expect(usePatternStore.getState().userPatterns).toEqual([]))
    expect(useEntityOrganizationStore.getState().organizations.patterns.trash).toEqual([])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to Patterns' })).not.toBeInTheDocument()
  })

  it.each([
    {
      entityKind: 'pattern', mode: 'Patterns', id: 'seed-1', oldName: 'Seed Pattern', nextName: 'Renamed Pattern',
      path: '/api/patterns/seed-1', seed: () => {}, records: () => usePatternStore.getState().userPatterns,
    },
    {
      entityKind: 'map', mode: 'Maps', id: 'm1', oldName: 'My Tree', nextName: 'Renamed Map',
      path: '/api/maps/m1', seed: () => { mockMaps = [CUSTOM_MAP] }, records: () => useMapStore.getState().userMaps,
    },
    {
      entityKind: 'mixin', mode: 'Mixins', id: 'mx1', oldName: 'tazii-crown-mask', nextName: 'Renamed Mixin',
      path: '/api/mixins/mx1', seed: () => { mockMixins = [CUSTOM_MIXIN] }, records: () => useMixinStore.getState().userMixins,
    },
    {
      entityKind: 'library', mode: 'Libraries', id: 'lib-rename', oldName: 'RenameLib', nextName: 'RenamedLib',
      path: '/api/libraries/lib-rename',
      seed: () => { mockLibraries = [{ id: 'lib-rename', name: 'RenameLib', src: 'function value(v) { return v }', updatedAt: 1 }] },
      records: () => useLibraryStore.getState().userLibraries,
    },
  ] as const)('preserves a rejected $entityKind rail rename and retries the requested name', async ({
    entityKind,
    mode,
    id,
    oldName,
    nextName,
    path,
    seed,
    records,
  }) => {
    seed()
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    if (mode !== 'Patterns') await user.click(screen.getByRole('radio', { name: mode }))
    await screen.findByText(oldName)
    blockedWrite = { path, method: 'PATCH' }

    await user.click(screen.getByRole('button', { name: `More actions for ${oldName}` }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await user.clear(screen.getByRole('textbox', { name: 'Rename item' }))
    await user.type(screen.getByRole('textbox', { name: 'Rename item' }), `${nextName}{Enter}`)

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent(`Could not rename ${entityKind} "${oldName}".`)
    expect(records().find((record) => record.id === id)?.name).toBe(oldName)

    blockedWrite = null
    await user.click(within(notice).getByRole('button', { name: `Retry rename ${entityKind}` }))

    await waitFor(() => expect(records().find((record) => record.id === id)?.name).toBe(nextName))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates a Pattern folder from the header menu and starts inline naming', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(await screen.findByRole('button', { name: 'Add pattern' }))
    await user.click(screen.getByRole('button', { name: 'New folder' }))

    expect(await screen.findByRole('textbox', { name: 'Rename item' })).toHaveValue('New Folder')
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

  it('falls back to the default Pattern when a gated session last opened a Show', async () => {
    const show = createDefaultShow('saved-show', 'Saved Show', 1000)
    mockShows = [show]
    mockLastActive = { type: 'show', id: show.id }

    render(<PatternList />)

    await waitFor(() => {
      expect(usePatternStore.getState().activeDemoName).toBe('IridescentFibers')
    })
    expect(useShowStore.getState().activeShowId).toBeNull()
    expect(useEditorStore.getState().previewPatternName).toBe('IridescentFibers')
    expect(useEditorStore.getState().previewSource).toBe(DEMOS.IridescentFibers)
    expect(requests.some((request) => (
      request.url === '/api/settings/lastActive' && request.init?.method === 'PUT'
    ))).toBe(false)
  })

  it('restores the last-active Show when showtime access is available', async () => {
    const show = createDefaultShow('saved-show', 'Saved Show', 1000)
    mockShows = [show]
    mockLastActive = { type: 'show', id: show.id }
    enableShowtime()

    render(<PatternList />)

    await waitFor(() => {
      expect(useShowStore.getState().activeShowId).toBe(show.id)
    })
    expect(usePatternStore.getState().activeDemoName).toBeNull()
  })

  it('lists built-in patterns in a collapsible Patterns section and opens them read-only', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    expect(await screen.findByRole('button', { name: 'Built-in Patterns' })).toHaveAttribute('aria-expanded', 'true')
    const builtInTree = screen.getByRole('tree', { name: 'Built-in Patterns' })
    const threeDFolder = within(builtInTree).getByRole('treeitem', { name: /^3D/ })
    expect(threeDFolder).toHaveAttribute('aria-expanded', 'false')
    expect(within(builtInTree).queryByText('AuroraSphere')).not.toBeInTheDocument()

    await user.click(threeDFolder)
    await user.click(screen.getByText('AuroraSphere'))

    expect(window.location.pathname).toBe('/studio/patterns/AuroraSphere')
    expect(usePatternStore.getState().activeDemoName).toBe('AuroraSphere')
    expect(useEditorStore.getState().isReadOnly).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Built-in Patterns' }))
    expect(screen.queryByText('AuroraSphere')).not.toBeInTheDocument()
  })

  it('renders only generally available entity modes in the activity strip', async () => {
    render(<PatternList />)

    expect(await screen.findByRole('radio', { name: 'Patterns' })).toHaveAttribute('aria-checked', 'true')
    for (const name of ['Maps', 'Mixins', 'Libraries', 'Controllers']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('radio', { name: 'Shows' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Catalog' })).not.toBeInTheDocument()
  })

  it('adds Shows to the activity strip when showtime access is available', async () => {
    enableShowtime()
    render(<PatternList />)

    expect(await screen.findByRole('radio', { name: 'Shows' })).toBeInTheDocument()
  })

  it('opens a stock library read-only from the Libraries rail without changing preview source', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await screen.findByText('Seed Pattern')
    const previewSourceBefore = useEditorStore.getState().previewSource

    await user.click(screen.getByRole('radio', { name: 'Libraries' }))

    expect(await screen.findByRole('button', { name: 'Built-in Libraries' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('StartHere')).toBeInTheDocument()

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
    await user.click(await screen.findByRole('button', { name: 'Add library' }))
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
    enableShowtime()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Shows' }))
    await user.click(await screen.findByRole('button', { name: 'Add show' }))
    await user.click(await screen.findByRole('button', { name: 'New show' }))

    expect(useShowStore.getState().showCreation).toEqual({ previousShowId: null })
    expect(useShowStore.getState().shows).toEqual([])
    expect(requests.some(({ url, init }) => url === '/api/shows' && init?.method === 'POST')).toBe(false)
    expect(window.location.pathname).toBe('/studio/shows')
  })

  it('returns to an open built-in Show when flicking rail modes away and back (#63)', async () => {
    const user = userEvent.setup()
    enableShowtime('/studio/shows/stock-show-showcase-redline-installation')
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Patterns' }))
    expect(window.location.pathname).toBe('/studio/patterns')
    await user.click(screen.getByRole('radio', { name: 'Shows' }))

    expect(window.location.pathname).toBe('/studio/shows/stock-show-showcase-redline-installation')
  })

  it('opens the paired built-in Show curriculum without creating personal records (#363)', async () => {
    const user = userEvent.setup()
    enableShowtime()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Shows' }))
    expect(await screen.findByRole('button', { name: 'Built-in Shows' })).toHaveAttribute('aria-expanded', 'true')
    const builtInTree = screen.getByRole('tree', { name: 'Built-in Shows' })
    expect(within(builtInTree).getByRole('treeitem', { name: /^Learn/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(builtInTree).getByRole('treeitem', { name: /^Showcases/ })).toHaveAttribute('aria-expanded', 'true')
    expect(within(builtInTree).getByRole('treeitem', { name: /^Installations/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(builtInTree).getByRole('treeitem', { name: /^Remixes/ })).toHaveAttribute('aria-expanded', 'false')
    const level100Folder = within(builtInTree).getByRole('treeitem', { name: /^100/ })
    expect(level100Folder).toHaveAttribute('aria-expanded', 'false')
    expect(within(builtInTree).queryByText('101 Clips, Cuts, and Blank Time')).not.toBeInTheDocument()

    await user.click(level100Folder)
    await user.click(screen.getByText('101 Clips, Cuts, and Blank Time'))

    expect(window.location.pathname).toBe('/studio/shows/stock-show-101-clips-cuts-blank-time')
    expect(useShowStore.getState().shows).toEqual([])
    expect(requests.some(({ url, init }) => url === '/api/shows' && init?.method === 'POST')).toBe(false)
  })

  it('shows the empty state when there are no custom maps', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByLabelText(/No custom maps yet/i)).toHaveTextContent('—')
  })

  it('lists user-authored custom maps under Maps', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()
    expect(screen.getAllByText('Maps')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Add map' }))
    expect(screen.getByRole('button', { name: 'New map' })).toBeInTheDocument()
  })

  it('creates a new map from the Maps title row', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)

    await user.click(await screen.findByRole('button', { name: 'Add map' }))
    await user.click(await screen.findByRole('button', { name: 'New map' }))

    expect(await screen.findByText('Untitled Map')).toBeInTheDocument()
    expect(useMapStore.getState().editingMap?.kind).toBe('existing')
  })

  it('lists durable controller profiles under Controllers', async () => {
    mockControllers = [CONTROLLER_PROFILE]
    const updateControllerProfile = vi.fn(async () => {})
    useControllerProfileStore.setState({ updateProfile: updateControllerProfile })
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Controllers' }))

    expect(await screen.findByText('Old alias')).toBeInTheDocument()
    expect(screen.queryByText('Burner bag')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New controller profile' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'More actions for Old alias' }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    await user.clear(screen.getByRole('textbox', { name: 'Rename item' }))
    await user.type(screen.getByRole('textbox', { name: 'Rename item' }), 'Road case{Enter}')
    expect(updateControllerProfile).toHaveBeenCalledWith('ctrl-1', { name: 'Road case' })
    expect(screen.queryByRole('textbox', { name: /search by name/i })).not.toBeInTheDocument()
  })

  it('lists user-authored cloud mixins under Mixins', async () => {
    mockMixins = [CUSTOM_MIXIN]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMixins(user)
    const mixinRow = (await screen.findByText('tazii-crown-mask')).closest('li')
    expect(mixinRow).not.toBeNull()
    await user.click(within(mixinRow!).getByText('tazii-crown-mask'))
    expect(within(mixinRow!).getByText('intercept')).toBeInTheDocument()
  })

  it('collapses and expands stock mixins in a muted Mixins section', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMixins(user)

    expect(screen.getByRole('button', { name: 'Built-in Mixins' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('pot-binding')).toBeInTheDocument()
    expect(screen.getByText('hw-brightness')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Built-in Mixins' }))

    expect(screen.getByRole('button', { name: 'Built-in Mixins' })).toHaveAttribute('aria-expanded', 'false')
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

    expect(screen.getByRole('button', { name: 'Built-in Maps' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Cube shell')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Built-in Maps' }))

    expect(screen.getByRole('button', { name: 'Built-in Maps' })).toHaveAttribute('aria-expanded', 'false')
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
    expect(screen.getByText('Ring').closest('[role="button"]')).toHaveClass(
      'min-h-[20px]',
      'text-[12px]',
      'leading-[15px]',
      'text-zinc-400',
    )
    const squareSummary = screen.getByText('Square').closest('summary')
    expect(squareSummary).toHaveClass('text-[12px]', 'leading-[15px]', 'text-zinc-400')
    expect(squareSummary?.closest('li')).toHaveClass('min-h-[20px]', 'py-px')
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
    await selectDimension(user, '1D')

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

    await user.click(screen.getByRole('button', { name: 'Dimension filter' }))
    expect(screen.getByRole('option', { name: '1D' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2D' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '3D' })).toBeInTheDocument()
  })

  it('preserves the 1D dimension lens when entering Maps mode', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)

    await selectDimension(user, '1D')
    expect(screen.getByRole('button', { name: 'Dimension filter' })).toHaveTextContent('1D')

    await switchToMaps(user)

    expect(screen.getByRole('button', { name: 'Dimension filter' })).toHaveTextContent('1D')
  })

  it('rebuilds the built-in Pattern tree with new categories collapsed after a rail-mode round trip (#809, #829)', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await selectDimension(user, '1D')
    await switchToMaps(user)
    await user.click(screen.getByRole('radio', { name: 'Patterns' }))
    expect(screen.queryByText('AuroraSphere')).not.toBeInTheDocument()

    await selectDimension(user, 'All')

    const builtInTree = screen.getByRole('tree', { name: 'Built-in Patterns' })
    const threeDFolder = within(builtInTree).getByRole('treeitem', { name: /^3D/ })
    expect(threeDFolder).toHaveAttribute('aria-expanded', 'false')
    expect(within(builtInTree).queryByText('AuroraSphere')).not.toBeInTheDocument()

    await user.click(threeDFolder)
    expect(screen.getByText('AuroraSphere')).toBeInTheDocument()
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

    await selectDimension(user, '1D')
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
    expect(screen.queryByLabelText('No custom maps yet')).not.toBeInTheDocument()
  })

  it('AND-combines the search query with the dimension lens', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    // Query matches but lens (2D) does not -> hidden.
    await user.type(screen.getByRole('textbox', { name: /search by name/i }), 'tree')
    await selectDimension(user, '2D')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    // Both match -> visible.
    await selectDimension(user, '3D')
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

    await selectDimension(user, '2D')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    await selectDimension(user, '3D')
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('does not duplicate the top-bar Gallery destination in another entity mode', async () => {
    const user = userEvent.setup()
    enableShowtime()
    render(<PatternList />)
    await user.click(screen.getByRole('radio', { name: 'Shows' }))
    expect(screen.queryByRole('button', { name: 'Catalog' })).not.toBeInTheDocument()
  })

  it('uses the shared legible hierarchy for Show organization and empty-state labels (#426, #479)', async () => {
    const user = userEvent.setup()
    enableShowtime()
    render(<PatternList />)
    await user.click(screen.getByRole('radio', { name: 'Shows' }))

    expect(await screen.findByLabelText('No shows yet')).toHaveTextContent('—')
    expect(screen.getByRole('treeitem', { name: /Learn/ })).toHaveClass('text-[12px]')
    expect(screen.getByRole('treeitem', { name: /Showcases/ })).toHaveClass('text-[12px]')
  })
})
