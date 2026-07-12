import { selectRoutingTransferLayout } from './showRoutingTransfer'

describe('routing layout transfer', () => {
  it('moves a stable forward threshold across normalized positions', () => {
    expect([0, 0.24, 0.25, 0.75, 1].map((position) => (
      selectRoutingTransferLayout(0.25, position, 'linear', 'forward')
    ))).toEqual(['destination', 'destination', 'source', 'source', 'source'])
  })

  it('applies easing and reverse direction without temporal sparkle', () => {
    const first = [0, 0.4, 0.8, 1].map((position) => (
      selectRoutingTransferLayout(0.5, position, 'ease-in', 'reverse')
    ))
    const second = [0, 0.4, 0.8, 1].map((position) => (
      selectRoutingTransferLayout(0.5, position, 'ease-in', 'reverse')
    ))
    expect(first).toEqual(['source', 'source', 'destination', 'destination'])
    expect(second).toEqual(first)
  })

  it('selects only the source at zero and only the destination at completion', () => {
    for (const position of [0, 0.5, 1]) {
      expect(selectRoutingTransferLayout(0, position, 'linear', 'forward')).toBe('source')
      expect(selectRoutingTransferLayout(1, position, 'linear', 'forward')).toBe('destination')
    }
  })
})
