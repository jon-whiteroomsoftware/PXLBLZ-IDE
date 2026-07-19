// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityStrip } from './ActivityStrip'

describe('ActivityStrip', () => {
  it('orders authoring surfaces by the Studio workflow', () => {
    render(<ActivityStrip mode="patterns" onModeChange={vi.fn()} />)

    expect(screen.getAllByRole('radio').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Patterns',
      'Shows',
      'Maps',
      'Controllers',
      'Mixins',
      'Libraries',
    ])
  })
})
