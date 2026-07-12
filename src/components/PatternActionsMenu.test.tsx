import { fireEvent, render, screen } from '@testing-library/react'
import { PatternActionsMenu } from './PatternActionsMenu'

describe('PatternActionsMenu', () => {
  it('keeps secondary actions in a labeled overflow menu', () => {
    const onCopy = vi.fn()
    const onDownload = vi.fn()
    const onDelete = vi.fn()
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onCopy={onCopy}
        onDownload={onDownload}
        onDelete={onDelete}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: 'Copy code' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))

    expect(screen.getByRole('menuitem', { name: 'Copy code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download .epe' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete pattern' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy code' }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem', { name: 'Copy code' })).not.toBeInTheDocument()
  })

  it('shows the applicable built-in Pattern actions', () => {
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onViewInGallery={vi.fn()}
        onClone={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))
    expect(screen.getByRole('menuitem', { name: 'View in Gallery' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clone into Patterns' })).toBeInTheDocument()
  })

  it('opens inward from the trigger in narrow panes', () => {
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onCopy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))

    expect(screen.getByRole('menu')).toHaveClass('left-0')
    expect(screen.getByRole('menu')).not.toHaveClass('right-0')
  })

  it('can open above an action bar near the bottom edge', () => {
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        side="above"
        onCopy={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))

    expect(screen.getByRole('menu')).toHaveClass('bottom-7')
    expect(screen.getByRole('menu')).not.toHaveClass('top-7')
  })
})
