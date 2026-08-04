import { render, screen } from '@testing-library/react'
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
})
