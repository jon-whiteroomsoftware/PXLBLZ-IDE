import { render, screen } from '@testing-library/react'
import { PreflightWarningList } from './PushConfirmPopover'

describe('PreflightWarningList', () => {
  it('renders multiple Show compatibility concerns without duplicate React keys (#799)', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<PreflightWarningList warnings={[
        {
          kind: 'show-map-compatibility',
          message: 'This Installation Show requires 2,000 pixels; the Controller reports 256.',
        },
        {
          kind: 'show-map-compatibility',
          message: 'This Installation Show map fingerprint does not match the Controller map.',
        },
      ]} />)

      expect(screen.getByText('This Installation Show requires 2,000 pixels; the Controller reports 256.'))
        .toBeInTheDocument()
      expect(screen.getByText('This Installation Show map fingerprint does not match the Controller map.'))
        .toBeInTheDocument()
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key')
    } finally {
      consoleError.mockRestore()
    }
  })
})
