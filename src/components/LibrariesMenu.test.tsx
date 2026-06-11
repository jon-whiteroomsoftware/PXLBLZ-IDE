import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LibrariesMenu } from './LibrariesMenu'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()

describe('LibrariesMenu', () => {
  beforeEach(() => {
    useEditorStore.setState(editorInitialState)
    usePatternStore.setState(patternInitialState)
  })

  it('renders the Code button collapsed', () => {
    render(<LibrariesMenu />)
    const button = screen.getByTestId('code-menu-button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveTextContent('Code')
    expect(screen.queryByTestId('code-menu-dropdown')).not.toBeInTheDocument()
  })

  it('opens the dropdown listing PixelBlaze plus every library', () => {
    render(<LibrariesMenu />)
    fireEvent.click(screen.getByTestId('code-menu-button'))
    expect(screen.getByTestId('code-menu-dropdown')).toBeInTheDocument()
    const items = screen.getAllByTestId('code-menu-item').map((el) => el.textContent)
    expect(items).toContain('PixelBlaze')
    for (const name of LIBRARY_NAMES) expect(items).toContain(name)
  })

  it('opens a library read-only in the editor on click and closes the menu', () => {
    render(<LibrariesMenu />)
    fireEvent.click(screen.getByTestId('code-menu-button'))
    const name = LIBRARY_NAMES[0]
    fireEvent.click(screen.getByText(name))
    expect(useEditorStore.getState().source).toBe(LIBRARIES[name])
    expect(useEditorStore.getState().isReadOnly).toBe(true)
    expect(usePatternStore.getState().activeLibraryName).toBe(name)
    expect(screen.queryByTestId('code-menu-dropdown')).not.toBeInTheDocument()
  })
})
