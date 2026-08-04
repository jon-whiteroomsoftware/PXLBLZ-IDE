import { act, render, screen } from '@testing-library/react'
import {
  ShowEntityDetailPanel,
  useShowEntityDetailPanelHeight,
} from './ShowEntityDetailPanel'

function HeightRequest({ height }: { height: number }) {
  useShowEntityDetailPanelHeight(height)
  return <div>Clip details</div>
}

describe('ShowEntityDetailPanel', () => {
  it('follows the active content height when its body owns overflow', () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)

    const { rerender } = render(
      <ShowEntityDetailPanel
        anchor={anchor}
        ownerKey="clip:test"
        bodyOwnsOverflow
        onClose={() => undefined}
      >
        <HeightRequest height={496} />
      </ShowEntityDetailPanel>,
    )

    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveStyle({
      height: '496px',
      maxHeight: '496px',
    })

    rerender(
      <ShowEntityDetailPanel
        anchor={anchor}
        ownerKey="clip:test"
        bodyOwnsOverflow
        onClose={() => undefined}
      >
        <HeightRequest height={360} />
      </ShowEntityDetailPanel>,
    )

    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveStyle({
      height: '360px',
      maxHeight: '360px',
    })

    anchor.remove()
  })

  it('places from the requested height instead of a previously clamped measurement', () => {
    const previousWidth = window.innerWidth
    const previousHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })

    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({
      left: 200,
      top: 250,
      right: 600,
      bottom: 290,
      width: 400,
      height: 40,
      x: 200,
      y: 250,
      toJSON: () => undefined,
    })
    document.body.append(anchor)

    render(
      <ShowEntityDetailPanel
        anchor={anchor}
        ownerKey="clip:test"
        bodyOwnsOverflow
        onClose={() => undefined}
      >
        <HeightRequest height={496} />
      </ShowEntityDetailPanel>,
    )

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    panel.getBoundingClientRect = () => ({
      left: 196,
      top: 300,
      right: 604,
      bottom: 692,
      width: 408,
      height: 392,
      x: 196,
      y: 300,
      toJSON: () => undefined,
    })
    act(() => window.dispatchEvent(new Event('resize')))

    expect(panel).toHaveStyle({ height: '496px', maxHeight: '496px' })

    anchor.remove()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: previousHeight })
  })
})
