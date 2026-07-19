import { act, render, screen } from '@testing-library/react'
import { LibraryContextPane } from './LibraryContextPane'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useLibraryStore, libraryInitialState } from '@/store/libraryStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  useLibraryStore.setState(libraryInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('LibraryContextPane (#350)', () => {
  it('renders live API docs and facts for an editable cloud library', () => {
    useLibraryStore.setState({
      editingLibrary: { kind: 'existing', id: 'lib-1' },
      userLibraries: [{
        id: 'lib-1',
        name: 'MyLib',
        src: '',
        updatedAt: 1,
      }],
    })
    usePatternStore.setState({ activeLibraryName: 'MyLib' })
    useEditorStore.setState({
      source: [
        'var outH = 0, outS = 0',
        '// Paints the indexed pixel.',
        '// @inline',
        'function paint(index, amount) {',
        '  return Color.blendMix(index, amount, 0.5)',
        '}',
      ].join('\n'),
    })

    render(<LibraryContextPane />)

    expect(screen.getByText('MyLib.paint(index, amount)')).toBeInTheDocument()
    expect(screen.getByText('MyLib.inline.paint(index, amount)')).toBeInTheDocument()
    expect(screen.getByText('Paints the indexed pixel.')).toBeInTheDocument()
    expect(screen.getByText('functions')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('outH, outS')).toBeInTheDocument()
    expect(screen.getByText('Color')).toBeInTheDocument()

    act(() => {
      useEditorStore.getState().setSource([
        'var outH = 0',
        '// Repainted live.',
        'function paint(index) { hsv(index, 1, 1) }',
      ].join('\n'))
    })

    expect(screen.getByText('MyLib.paint(index)')).toBeInTheDocument()
    expect(screen.getByText('Repainted live.')).toBeInTheDocument()
  })

  it('shows an honest empty state when functions have no doc comments', () => {
    useLibraryStore.setState({
      editingLibrary: { kind: 'existing', id: 'lib-1' },
      userLibraries: [{ id: 'lib-1', name: 'MyLib', src: '', updatedAt: 1 }],
    })
    usePatternStore.setState({ activeLibraryName: 'MyLib' })
    useEditorStore.setState({ source: 'function helper(v) { return v }' })

    render(<LibraryContextPane />)

    expect(screen.getByText('No documented functions yet.')).toBeInTheDocument()
    expect(screen.getByText('functions')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders stock library docs read-only from the current editor source', () => {
    useLibraryStore.setState({ editingLibrary: { kind: 'stock', id: 'Shader' } })
    usePatternStore.setState({ activeLibraryName: 'Shader' })
    useEditorStore.setState({
      source: '// Fractional part\nfunction fract(x) { return x - floor(x) }',
    })

    render(<LibraryContextPane />)

    expect(screen.getByText('Shader')).toBeInTheDocument()
    expect(screen.getByText('stock library')).toBeInTheDocument()
    expect(screen.getByText('Shader.fract(x)')).toBeInTheDocument()
    expect(screen.getByText('Fractional part')).toBeInTheDocument()
  })
})
