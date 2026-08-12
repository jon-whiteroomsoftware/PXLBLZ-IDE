import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Editor } from './Editor'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { openPatternRecord } from '@/store/openPattern'

vi.mock('@/components/PixelblazeCodeEditor', () => ({
  PixelblazeCodeEditor: ({
    value,
    onChange,
    onMount,
  }: {
    value: string
    onChange?: (value: string) => void
    onMount?: (editor: unknown, monaco: unknown) => void
  }) => {
    onMount?.(
      { getModel: () => ({ getLineMaxColumn: () => 2 }) },
      { editor: { setModelMarkers: () => {} }, MarkerSeverity: { Error: 8 } },
    )
    return <textarea aria-label="Pattern source" value={value} onChange={(event) => onChange?.(event.target.value)} />
  },
}))

const CLEAN = 'export function render(index) { hsv(index / pixelCount, 1, 1) }'
const BROKEN = 'export function render(index) {'
const REPAIRED = 'export function render(index) { rgb(0, index / pixelCount, 1) }'

function provider(updatePattern: PersonalContentProvider['updatePattern']): PersonalContentProvider {
  return {
    id: 'editor-recovery-test',
    listPatterns: async () => [],
    createPattern: async () => {},
    updatePattern,
    deletePattern: async () => {},
    listMaps: async () => [],
    createMap: async () => {},
    updateMap: async () => {},
    deleteMap: async () => {},
    listMixins: async () => [],
    createMixin: async () => {},
    updateMixin: async () => {},
    deleteMixin: async () => {},
    listShows: async () => [],
    createShow: async () => {},
    updateShow: async () => {},
    deleteShow: async () => {},
    listControllerProfiles: async () => [],
    createControllerProfile: async () => {},
    updateControllerProfile: async () => {},
    deleteControllerProfile: async () => {},
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

describe('Pattern editor recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetPersonalContentProvider()
    usePatternStore.setState({
      ...patternInitialState,
      activePatternId: 'pattern-recovery',
      userPatterns: [{
        id: 'pattern-recovery',
        name: 'Pattern recovery',
        src: CLEAN,
        controls: {},
        updatedAt: 1,
      }],
    })
    useEditorStore.setState({
      ...editorInitialState,
      source: CLEAN,
      previewSource: CLEAN,
      isReadOnly: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    resetPersonalContentProvider()
  })

  it('keeps the last-clean preview and persistence until malformed source is repaired', async () => {
    const updatePattern = vi.fn<PersonalContentProvider['updatePattern']>(async () => {})
    setPersonalContentProvider(provider(updatePattern))
    render(<Editor />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern source' }), { target: { value: BROKEN } })
    expect(useEditorStore.getState().compileStatus).toBe('broken')

    await act(async () => { vi.advanceTimersByTime(4_600) })
    expect(useEditorStore.getState().previewSource).toBe(CLEAN)
    expect(updatePattern).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern source' }), { target: { value: REPAIRED } })
    expect(useEditorStore.getState().compileStatus).toBe('good')

    await act(async () => { vi.advanceTimersByTime(3_400) })
    expect(useEditorStore.getState().previewSource).toBe(REPAIRED)
    expect(updatePattern).toHaveBeenCalledWith('pattern-recovery', expect.objectContaining({ src: REPAIRED }))
    expect(usePatternStore.getState().userPatterns[0].src).toBe(REPAIRED)
  })

  it('restarts an unavailable saved preview after the source is repaired', async () => {
    const updatePattern = vi.fn<PersonalContentProvider['updatePattern']>(async () => {})
    setPersonalContentProvider(provider(updatePattern))
    usePatternStore.setState((state) => ({
      userPatterns: state.userPatterns.map((pattern) => ({ ...pattern, src: BROKEN })),
    }))
    useEditorStore.setState({
      source: BROKEN,
      previewSource: '',
      previewUnavailableReason: 'broken-source',
      compileStatus: 'broken',
    })
    render(<Editor />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern source' }), { target: { value: REPAIRED } })
    expect(useEditorStore.getState().compileStatus).toBe('good')

    await act(async () => { vi.advanceTimersByTime(600) })
    expect(useEditorStore.getState()).toMatchObject({
      previewSource: REPAIRED,
      previewUnavailableReason: null,
    })
  })

  it('never publishes Pattern A debounce source after empty Pattern B opens', async () => {
    const updatePattern = vi.fn<PersonalContentProvider['updatePattern']>(async () => {})
    setPersonalContentProvider(provider(updatePattern))
    const emptyPattern = {
      id: 'pattern-empty',
      name: 'Empty Pattern',
      src: '',
      controls: {},
      updatedAt: 2,
    }
    usePatternStore.setState((state) => ({
      userPatterns: [...state.userPatterns, emptyPattern],
    }))
    render(<Editor />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Pattern source' }), { target: { value: REPAIRED } })
    expect(useEditorStore.getState().compileStatus).toBe('good')
    act(() => openPatternRecord(emptyPattern))

    await act(async () => { vi.advanceTimersByTime(600) })
    expect(useEditorStore.getState()).toMatchObject({
      source: '',
      previewSource: '',
      previewUnavailableReason: 'empty-source',
    })
  })
})
