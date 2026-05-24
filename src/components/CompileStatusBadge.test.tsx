import { render, screen, act } from '@testing-library/react'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { CompileStatusBadge } from './CompileStatusBadge'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
})

describe('CompileStatusBadge', () => {
  it('shows good status', () => {
    useEditorStore.setState({ compileStatus: 'good' })
    render(<CompileStatusBadge />)
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  })

  it('shows broken status', () => {
    useEditorStore.setState({ compileStatus: 'broken' })
    render(<CompileStatusBadge />)
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  })

  it('updates when store changes', () => {
    useEditorStore.setState({ compileStatus: 'good' })
    render(<CompileStatusBadge />)
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    act(() => { useEditorStore.setState({ compileStatus: 'broken' }) })
    expect(screen.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')
  })
})
