import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import {
  controllerProfileInitialState,
  useControllerProfileStore,
  type ControllerProfile,
} from '@/store/controllerProfileStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { getAuthSession } from '@/engine/authSession'
import { useRouterStore, routerInitialState } from '@/store/routerStore'

vi.mock('@/engine/authSession', () => ({
  getAuthSession: vi.fn(),
}))

const SEED_PATTERN = { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 }

let mockMaps: MapRecord[] = []
let mockControllers: ControllerProfile[] = []
let requests: Array<{ url: string; init?: RequestInit }> = []

beforeEach(() => {
  vi.clearAllMocks()
  mockMaps = []
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
    if (String(url) === '/api/controllers' && init?.method === undefined) {
      return Response.json({ controllers: mockControllers })
    }
    if (String(url).startsWith('/api/settings/') && init?.method === undefined) {
      return Response.json({})
    }
    return Response.json({ ok: true })
  }))
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
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

const CONTROLLER_PROFILE: ControllerProfile = {
  id: 'ctrl-1',
  name: 'Burner bag',
  deviceId: 'pixelblaze_pb32_3cd4ee549434',
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

describe('PatternList', () => {
  it('labels personal sections with the entity name', async () => {
    render(<PatternList />)

    expect(await screen.findAllByText('Patterns')).toHaveLength(2)
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

  it('renders the five-entity activity strip plus Catalog entry', async () => {
    render(<PatternList />)

    expect(await screen.findByRole('radio', { name: 'Patterns' })).toHaveAttribute('aria-checked', 'true')
    for (const name of ['Maps', 'Mixins', 'Controllers', 'Shows']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Catalog' })).toBeInTheDocument()
  })

  it('selects entity kinds through /studio/<kind> routes', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Mixins' }))

    expect(window.location.pathname).toBe('/studio/mixins')
    expect(screen.getAllByText('Mixins')).toHaveLength(2)
  })

  it('shows the empty state when there are no custom maps', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('No custom maps yet')).toBeInTheDocument()
  })

  it('lists user-authored custom maps under Maps', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()
  })

  it('lists durable controller profiles under Controllers', async () => {
    mockControllers = [CONTROLLER_PROFILE]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: 'Controllers' }))

    expect(await screen.findByText('Burner bag')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /search by name/i })).not.toBeInTheDocument()
  })

  it('keeps stock maps out of the rail and points to the Catalog', async () => {
    const user = userEvent.setup()
    render(<PatternList />)
    expect(screen.queryByText('Stock Maps')).not.toBeInTheDocument()
    await switchToMaps(user)
    expect(screen.queryByText('Stock Maps')).not.toBeInTheDocument()
    expect(screen.queryByText('Cube shell')).not.toBeInTheDocument()
    expect(screen.getByText(/Stock maps moved to the catalog/i)).toBeInTheDocument()
  })

  it('hides the 1D dimension lens in Maps mode', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)
    await switchToMaps(user)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    expect(screen.queryByRole('radio', { name: '1D' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2D' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3D' })).toBeInTheDocument()
  })

  it('switches the dimension lens from 1D to 2D when entering Maps mode', async () => {
    mockMaps = [CUSTOM_MAP]
    const user = userEvent.setup()
    render(<PatternList />)

    await user.click(screen.getByRole('radio', { name: '1D' }))
    expect(screen.getByRole('radio', { name: '1D' })).toHaveAttribute('aria-checked', 'true')

    await switchToMaps(user)

    expect(screen.queryByRole('radio', { name: '1D' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '2D' })).toHaveAttribute('aria-checked', 'true')
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
    expect(screen.getAllByText('Maps')).toHaveLength(2)
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

  it('surfaces a search hit inside a collapsed entity section, then restores collapse when cleared', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    expect(await screen.findByText('Seed Pattern')).toBeInTheDocument()
    await user.click(screen.getAllByText('Patterns')[1])
    expect(screen.queryByText('Seed Pattern')).not.toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search by name/i })
    await user.type(search, 'seed')
    expect(screen.getByText('Seed Pattern')).toBeInTheDocument()

    await user.clear(search)
    expect(screen.queryByText('Seed Pattern')).not.toBeInTheDocument()
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
    await user.click(screen.getAllByText('Patterns')[1])

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
