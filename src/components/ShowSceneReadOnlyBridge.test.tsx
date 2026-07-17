import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { createDefaultShow, extendShowCell, updateShowBoundaryTransition, updateShowCellEffects } from '@/engine/showModel'
import { projectFlatShowComposition } from '@/engine/showCompositionProjection'
import { projectSceneReadOnlyBridge } from '@/engine/showSceneReadOnlyProjection'
import { ShowSceneSuperDetail, ShowSceneXray } from './ShowSceneReadOnlyBridge'

const SOURCE = 'export function render(index) { hsv(index / 60, 1, 1) }'

function detailFixture() {
  let show = createDefaultShow('scene-bridge-ui', 'Scene bridge UI', 1)
  show = extendShowCell(show, 'cell-1', 2)
  show = updateShowCellEffects(show, 'cell-1', [
    { id: 'fx-swirl', kind: 'swirl', amount: 0.7, radius: 0.5, centerX: 0.5, centerY: 0.5 },
  ])
  show = updateShowBoundaryTransition(show, 'transition-scene-1', {
    propertyTransitions: {
      brightness: {
        fromByCellId: { 'cell-1': 0.2 },
        durationMs: 800,
        easing: { curve: 'linear' },
      },
    },
  })
  const projection = projectFlatShowComposition(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
    stageDimension: 2,
  })
  return projectSceneReadOnlyBridge(projection, 'scene-2')
}

describe('Show Scene read-only bridge (#471)', () => {
  it('renders the X-ray as one fixed 36px row with three non-editable strata', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onPin = vi.fn()
    render(
      <ShowSceneXray
        detail={detailFixture()}
        active={false}
        pinned={false}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onPin={onPin}
      />,
    )

    const xray = screen.getByRole('group', { name: 'Scene 2 Scene X-ray, read only' })
    expect(xray).toHaveClass('h-[36px]')
    expect(xray).not.toHaveTextContent('cuts')
    expect(xray).not.toHaveTextContent('properties')
    expect(screen.getByRole('group', { name: 'brightness 0.2 to 1' }).querySelector('polyline')).toBeInTheDocument()
    expect(withinInputs(xray)).toHaveLength(0)

    fireEvent.mouseEnter(xray)
    expect(onPreview).toHaveBeenCalledWith(xray)
    fireEvent.mouseLeave(xray)
    expect(onPreviewEnd).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Pin Scene 2 Super Detail' }))
    expect(onPin).toHaveBeenCalledOnce()
    expect(onPin).toHaveBeenCalledWith(xray)
  })

  it('opens one modeless read-only Super Detail layer and dismisses it with Escape', () => {
    const onClose = vi.fn()
    const anchor = document.body.appendChild(document.createElement('button'))
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      x: 40,
      y: 80,
      top: 80,
      right: 160,
      bottom: 116,
      left: 40,
      width: 120,
      height: 36,
      toJSON: () => ({}),
    })
    render(<ShowSceneSuperDetail detail={detailFixture()} anchor={anchor} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Scene 2 Super Detail' })
    expect(dialog).toHaveAttribute('aria-modal', 'false')
    expect(dialog).toHaveStyle({ top: '122px' })
    expect(dialog.querySelector('.overflow-auto')).not.toBeInTheDocument()
    expect(dialog.querySelector('header')).toHaveClass('h-8')
    expect(dialog).toHaveTextContent('Global 00:32.0–01:02.0')
    expect(dialog).toHaveTextContent('Local 00:00.0–00:30.0')
    expect(dialog).toHaveTextContent('TestPattern1D')
    expect(dialog).toHaveTextContent('continues in')
    expect(withinInputs(dialog)).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Open Scene' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    anchor.remove()
  })

  it('offers the production Scene editor only when an open handler is available (#487)', () => {
    const onClose = vi.fn()
    const onOpenScene = vi.fn()
    const anchor = document.body.appendChild(document.createElement('button'))
    render(
      <ShowSceneSuperDetail
        detail={detailFixture()}
        anchor={anchor}
        onClose={onClose}
        onOpenScene={onOpenScene}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Scene 2 editor' }))
    expect(onOpenScene).toHaveBeenCalledWith('scene-2')
    expect(onClose).toHaveBeenCalledOnce()
    anchor.remove()
  })
})

function withinInputs(element: HTMLElement): Element[] {
  return [...element.querySelectorAll('input, select, textarea, [contenteditable="true"]')]
}
