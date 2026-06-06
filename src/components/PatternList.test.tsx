import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { DEMOS } from '@/pixelblaze/demos'

vi.mock('@/engine/storage', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/engine/storage')>()
  return {
    ...orig,
    listPatterns: vi.fn().mockResolvedValue([
      { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 },
    ]),
    getSetting: vi.fn().mockResolvedValue(undefined),
    setSetting: vi.fn().mockResolvedValue(undefined),
    createPattern: vi.fn().mockResolvedValue(undefined),
    listMaps: vi.fn().mockResolvedValue([]),
    deleteMap: vi.fn().mockResolvedValue(undefined),
  }
})

import { listMaps } from '@/engine/storage'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
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

describe('PatternList', () => {
  it('clicking a demo sets previewSource to the demo source', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewSource).toBe(DEMOS[demoName])
  })

  it('clicking a demo sets previewPatternName to the demo name', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewPatternName).toBe(demoName)
  })

  it('shows the empty state when there are no custom maps', async () => {
    render(<PatternList />)
    expect(await screen.findByText('No custom maps yet')).toBeInTheDocument()
  })

  it('lists user-authored custom maps under "Your Maps"', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()
  })

  it('hides "Your Maps" and non-matching maps under the 1D dimension lens', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '1D' }))

    expect(screen.queryByText('Your Maps')).not.toBeInTheDocument()
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
  })

  it('filters maps by name via the type-down search box', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    const search = screen.getByRole('textbox', { name: /search patterns by name/i })
    await user.type(search, 'tree')
    expect(screen.getByText('My Tree')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'xyz')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
  })

  it('does not show the "no maps yet" empty state when a filter merely empties the list', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /search patterns by name/i }), 'nope')
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()
    // Header stays, but the genuine-empty message must not appear.
    expect(screen.getByText('Your Maps')).toBeInTheDocument()
    expect(screen.queryByText('No custom maps yet')).not.toBeInTheDocument()
  })

  it('AND-combines the search query with the dimension lens', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    // Query matches but lens (2D) does not -> hidden.
    await user.type(screen.getByRole('textbox', { name: /search patterns by name/i }), 'tree')
    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    // Both match -> visible.
    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })

  it('shows a 3D custom map under the 3D lens but not the 2D lens', async () => {
    vi.mocked(listMaps).mockResolvedValueOnce([CUSTOM_MAP])
    const user = userEvent.setup()
    render(<PatternList />)
    expect(await screen.findByText('My Tree')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '2D' }))
    expect(screen.queryByText('My Tree')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: '3D' }))
    expect(screen.getByText('My Tree')).toBeInTheDocument()
  })
})
