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
})
