import { render, screen, fireEvent } from '@testing-library/react'
import { DocsMenu } from './DocsMenu'
import { USER_DOCS } from '@/docs/catalog'
import { useDocsStore, docsInitialState } from '@/store/docsStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

describe('DocsMenu', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/')
    useDocsStore.setState(docsInitialState)
    useEditorStore.setState({ ...editorInitialState, source: 'keep me' })
  })

  it('renders collapsed', () => {
    render(<DocsMenu />)
    expect(screen.getByTestId('docs-menu-button')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('docs-menu-dropdown')).not.toBeInTheDocument()
  })

  it('lists only user-facing docs', () => {
    render(<DocsMenu />)
    fireEvent.click(screen.getByTestId('docs-menu-button'))
    const items = screen.getAllByTestId('docs-menu-item').map((item) => item.textContent)
    for (const doc of USER_DOCS) expect(items.join(' ')).toContain(doc.menuLabel)
    expect(items.join(' ')).not.toContain('Technical Reference')
  })

  it('opens a doc without mutating editor source', () => {
    render(<DocsMenu />)
    fireEvent.click(screen.getByTestId('docs-menu-button'))
    fireEvent.click(screen.getByText('Feature Guide'))
    expect(useDocsStore.getState().activeDocId).toBe('feature-guide')
    expect(useEditorStore.getState().source).toBe('keep me')
    expect(location.hash).toBe('#/docs/feature-guide')
  })
})
