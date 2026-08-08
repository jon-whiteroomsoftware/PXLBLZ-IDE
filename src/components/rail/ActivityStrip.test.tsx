// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActivityStrip } from './ActivityStrip'

describe('ActivityStrip', () => {
  it('hides the Shows entry when showtime access is unavailable', () => {
    render(<ActivityStrip mode="patterns" onModeChange={vi.fn()} />)

    expect(screen.getAllByRole('radio').map((item) => item.getAttribute('aria-label'))).toEqual([
      'Patterns',
      'Maps',
      'Controllers',
      'Mixins',
      'Libraries',
    ])
  })

  it('restores the Shows entry in workflow order when showtime access is available', () => {
    render(<ActivityStrip mode="patterns" onModeChange={vi.fn()} showsEnabled />)

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
